use base64::engine::general_purpose;
use base64::Engine as _;
use image::{load_from_memory, Rgba, RgbaImage};
use reqwest::Certificate;
use reqwest::blocking::Client;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use std::env;
use std::error::Error;
use std::fs;
use std::io::Cursor;
use std::thread::sleep;
use std::time::Duration;
use log::{info, error};
use forgery_detection_zero::Zero;

#[derive(Deserialize)]
struct Job {
    compute_module_job_v1: ComputeModuleJobV1,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct ComputeModuleJobV1 {
    job_id: String,
    query_type: String,
    query: Query,
}

#[derive(Serialize)]
struct QueryResult {
    enc_img_out: String,
    text: String,
    result: String,
}

#[derive(Deserialize)]
struct Query {
    enc_img_in: String
}

#[derive(Debug)]
struct Point {
    x: u32,
    y: u32,
}

#[derive(Debug)]
struct Region {
    start: Point,
    end: Point,
}

fn get_job_blocking(client: &Client, get_job_uri: &str, module_auth_token: &str) -> Result<Job, reqwest::Error> {
    loop {
        let response = client.get(get_job_uri)
            .header("Module-Auth-Token", module_auth_token)
            .send()?;
        
        match response.status().as_u16() {
            200 => return response.json(),
            204 => info!("No job found, trying again!"),
            _ => error!("Unexpected status code: {}", response.status()),
        }
    }
}

fn draw_hollow_rect(image: &mut RgbaImage, region: &Region, color: Rgba<u8>) {
    let Region { start, end } = region;

    // Draw top and bottom borders
    for x in start.x..=end.x {
        image.put_pixel(x, start.y, color);
        image.put_pixel(x, end.y, color);
    }

    // Draw left and right borders
    for y in start.y..=end.y {
        image.put_pixel(start.x, y, color);
        image.put_pixel(end.x, y, color);
    }
}

fn detect_fraud(query: Query) -> Result<QueryResult, Box<dyn Error>> {
    let image_data = general_purpose::STANDARD.decode(query.enc_img_in.clone()).expect("Failed to deserialize base64 enc image");
    let image = load_from_memory(&image_data).expect("failed to load image");
    let foreign_grid_areas = Zero::from_image(&image).detect_forgeries();
    let missing_grid_areas = foreign_grid_areas
        .detect_missing_grid_areas()
        .unwrap()
        .unwrap();
    let forged_regions = foreign_grid_areas
        .forged_regions()
        .iter()
        .chain(missing_grid_areas.forged_regions());
    let mut accumulated = String::new();
    let red = Rgba([255, 0, 0, 255]);
    let mut image_buffer = image.to_rgba8();
    for r in forged_regions {
        accumulated.push_str(&format!("Forged region: from ({}, {}) to ({}, {})\n", r.start.0, r.start.1, r.end.0, r.end.1));
        draw_hollow_rect(&mut image_buffer, &Region { start: Point { x: r.start.0, y: r.start.1 }, end: Point { x: r.end.0, y: r.end.1 } }, red);
    }
    if !accumulated.is_empty() {
        let mut result = "edited";
        if foreign_grid_areas.is_cropped() {
            result = "editcrop";
        }
        let mut buf = Cursor::new(Vec::new());
        image_buffer.write_to(&mut buf, image::ImageOutputFormat::Png)?;
        let enc_img_out = general_purpose::STANDARD.encode(buf.into_inner());
        return Ok(QueryResult { enc_img_out, text: accumulated, result: result.to_owned() });
    }

    if foreign_grid_areas.is_cropped() {
        return Ok(QueryResult {enc_img_out: query.enc_img_in, text: "".to_owned(), result: "cropped".to_owned() });
    }

    return Ok(QueryResult { enc_img_out: query.enc_img_in, text: "".to_owned(), result: "clean".to_owned()});
}


fn post_result(client: &Client, post_result_uri: &str, job_id: &str, result: &QueryResult, module_auth_token: &str) {
    let response = client.post(&format!("{}/{}", post_result_uri, job_id))
        .header("Module-Auth-Token", module_auth_token)
        .header(CONTENT_TYPE, "application/octet-stream")
        .body(serde_json::to_string(result).expect("Failed to serialize results"))
        .send();
    
    match response {
        Ok(res) => {
            if res.status() != 204 {
                info!("Failed to post result: {}", res.status());
            }
        }
        Err(err) => {
            error!("Error posting result: {}", err);
        }
    }
}

fn main() {
    env_logger::init();

    let cert_path = env::var("DEFAULT_CA_PATH").expect("DEFAULT_CA_PATH environment variable not set");
    let module_auth_token = fs::read_to_string(env::var("MODULE_AUTH_TOKEN").expect("MODULE_AUTH_TOKEN environment variable not set"))
        .expect("Failed to read module auth token");
    
    let get_job_uri = "https://localhost:8945/interactive-module/api/internal-query/job";
    let post_result_uri = "https://localhost:8945/interactive-module/api/internal-query/results";
    let cert_data = fs::read(cert_path.clone()).expect("Failed to read cert path");
    let cert = Certificate::from_pem(&cert_data).expect("Failed to load cert");

    let client = Client::builder()
        .add_root_certificate(cert)
        .use_rustls_tls()
        .build()
        .expect("Failed to build client");

    loop {
        match get_job_blocking(&client, get_job_uri, &module_auth_token) {
            Ok(job) => {
                let v1 = job.compute_module_job_v1;
                let job_id = &v1.job_id;

                match detect_fraud(v1.query) {
                    Ok(res) => post_result(&client, post_result_uri, job_id, &res, &module_auth_token),
                    Err(err) => post_result(&client, post_result_uri, job_id, &QueryResult { enc_img_out: String::new(), text: err.to_string(), result: "failed".to_owned() }, &module_auth_token),
                }
            }
            Err(err) => {
                error!("Something failed: {}", err);
                sleep(Duration::from_secs(1));
            }
        }
    }
}

