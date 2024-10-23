import css from "./Home.module.css";
import Layout from "./Layout";
import client from "./client";
import { useEffect, useState } from "react";
import '@mantine/core/styles.css';
import '@mantine/dropzone/styles.css';

import { MantineProvider, Image, Skeleton, Loader } from '@mantine/core';
import { arrayBufferToBase64, ImageDropZone } from "./ImageDrop";
import { isOk } from "@fraud/sdk";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import React from "react";

export const mediaSet = "ri.mio.main.media-set.1d4b803f-bc7b-48b4-a74b-7cf85c04a912"

function Home() {
    const [imageURLs, setImageURLs] = useState<DownloadedMediaItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [uploadedMediaItem, setUploadedMediaItem] = useState<string | null>(null);
    const [detectedText, setDetectedText] = useState<string | null>(null);
    const [encodedImage, setEncodedImage] = useState<string | null>(null);
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
    const [loadingInput, setLoadingInput] = useState(false);
    const [loadingOutput, setLoadingOutput] = useState(false);
    const [detectedResult, setDetectedResult] = useState<string | null>(null);

    useEffect(() => {
        setEncodedImage(prev => {
            if (prev != null) {
                detectFraudFunc(prev, setUploadedImageUrl, setDetectedText, setLoadingOutput, setDetectedResult);
            }
            return null;
        })
    }, [encodedImage, setUploadedImageUrl, setDetectedText, setLoadingOutput, setDetectedResult, setEncodedImage]);

    useEffect(() => {
        if (uploadedMediaItem != null) {
            getMediaItemInfo(mediaSet, uploadedMediaItem).then(info => {
                downloadMediaThumbnail(mediaSet, {
                    mediaItemRid: uploadedMediaItem,
                    logicalTimestamp: info.logicalTimestamp,
                    path: info.path
                }).then(thumbnail => {
                    setImageURLs(prev => [thumbnail, ...prev])
                })
            })
        }
    }, [uploadedMediaItem])

    useEffect(() => {
        const fetchImage = async () => {
            try {
                setLoading(true);
                const items = await getMediaItems(mediaSet)
                for (const item of items.slice(0,30)) {
                    downloadMediaThumbnail(mediaSet, item).then(thumbnail => {
                        setImageURLs(prev => {
                            for (let item of prev) {
                                if (item.rid === thumbnail.rid) {
                                    return prev
                                }
                            }
                            return [...prev, thumbnail]
                        })
                        setLoading(false);
                    }).catch(err => console.log(err))
                }
            } catch (err) {
                console.log(err);
            }
        };

        fetchImage();
    }, [setImageURLs]);

    const handleImageSelect = (item: DownloadedMediaItem) => (_event: React.MouseEvent) => {
        setLoadingInput(true);
        setLoadingOutput(true);
        downloadMediaItem(mediaSet, item.rid).then(blob => {
            const url = URL.createObjectURL(blob);
            setUploadedImageUrl(url);
            setLoadingInput(false);
            convertObjectToB64(blob).then(b64 => setEncodedImage(b64));
        })
    }

    return (
        <MantineProvider>
            <Layout>
                <h1>Image Fraud Detector</h1>
                <ImageDropZone setLoadingInput={setLoadingInput} setUploadedImageUrl={setUploadedImageUrl} setUploadedMediaItem={setUploadedMediaItem} setEncodedImage={setEncodedImage} />
                <Skeleton visible={loading}>
                    <div className={css.previousMedia}>
                        {imageURLs
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .map(item => (
                                <button key={item.url} className={css.transparent} onMouseDown={handleImageSelect(item)}>
                                    <Image 
                                        key={item.url}
                                        radius="md"
                                        h="100"
                                        w="100"
                                        fit="contain"
                                        src={item.url}
                                        alt={`Image ${item.name}`}
                                    />
                                    <span>{item.name}</span>
                                </button>
                        ))}
                    </div>
                </Skeleton>
                <DetectionResult detectedResult={detectedResult} loadingInput={loadingInput} loadingOutput={loadingOutput}  />
                <div className={css.dynamicImages}>
                    <Skeleton visible={loadingInput}>
                        <div className={css.imageContainer}>
                            <Image
                                radius="md"
                                src={uploadedImageUrl}
                                fit="contain"
                                h="auto"
                                w="auto"
                                mah="100%"
                                maw="100%"
                                fallbackSrc="https://placehold.co/600x400?text=output"
                            />
                        </div>
                    </Skeleton>
                </div>
        </Layout>
    </MantineProvider>
  );
}

const DetectionResult = React.memo<{
   detectedResult: string | null;
   loadingInput: boolean;
   loadingOutput: boolean;
}>(function _detectionResult({detectedResult, loadingInput, loadingOutput}) {

    return (
        <div>
            {loadingOutput ? (
                <div className={css.fraudResult}>
                    {loadingInput ? (
                        <span>Loading media and running fraud detection</span>
                    ) : (
                        <span>Running fraud detection</span>
                    )}
                    <Loader type="dots"/>
                </div>
            ) : (
                <>{translateDetectionResult(detectedResult)}</>
            )}
        </div>
    );
});

interface MediaPage {
    records: MediaItem[]
}

interface MediaItem {
    mediaItemRid: string;
    logicalTimestamp: number;
    path: string;
}

function translateDetectionResult(result: string | null) {
    if (result == null) {
        return (
            <div className={css.fraudResult}>
            </div>
        );
    } else if (result === "edited") {
        return (
            <div className={css.fraudResult}>
                <span>Image was edited</span>
                <IconAlertTriangle style={{color: "#f59f00"}}/>
            </div>
        );
    } else if (result === "editcrop") {
        return (
            <div className={css.fraudResult}>
                <span>Image was edited and cropped</span>
                <IconAlertTriangle style={{color: "#f59f00"}}/>
            </div>
        );
    } else if (result === "cropped") {
        return (
            <div className={css.fraudResult}>
                <span>Image was cropped</span>
                <IconAlertTriangle style={{color: "#f59f00"}}/>
            </div>
        );
    } else if (result === "clean") {
        return (
            <div className={css.fraudResult}>
                <span>Image is unedited</span>
                <IconCheck style={{color: "#2fb344"}}/>
            </div>
        );
    }
}

async function detectFraudFunc(enc_img: string, setDetectUrl: (value: string) => void, setDetectText: (value: string) => void, setLoadingOutput: (value: boolean) => void, setDetectedResult: (value: string) => void) {
    setLoadingOutput(true);
    const response = await client.ontology.queries.detectFraud({
        enc_img_in: enc_img 
    });
    if (isOk(response)) {
        const res = response.value.value;
        setDetectedResult(res.result);
        setDetectText(res.text);
        if (res.result === "failed") {
            console.log(res.text)
            return
        }
        const dec_img_str = atob(res.enc_img_out)
        const img_bytes = Uint8Array.from(dec_img_str, c => c.charCodeAt(0));
        const img_blob = new Blob([img_bytes], { type: 'image/png' });
        const img_url = URL.createObjectURL(img_blob);
        setDetectUrl(img_url);
        setLoadingOutput(false);
    } else {
        console.log(JSON.stringify(response.error));
    }
}

async function convertObjectToB64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result;
            if (content) {
                try {
                    resolve(arrayBufferToBase64(content as ArrayBuffer));
                } catch(error) {
                    console.log(error);
                    reject(error);
                }
            }
        }
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

async function getMediaItems(mediaSet: string): Promise<MediaItem[]> {
    const url = `https://tekuro.usw-16.palantirfoundry.com/mio/api/media-set/${mediaSet}/paging`;
    const response = await client.auth.executeWithToken(token => {
        return fetch(url, {
            method: "POST",
            headers: {
                'accept': '*/*',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token.accessToken}`,
            },
            body: JSON.stringify({
                type: {
                    type: "fromLatest",
                    fromLatest: {}
                }
            }),
        });
    })

    const page = await response.json() as MediaPage
    return page.records.filter(item => !item.mediaItemRid.includes("tombstone"))
}

interface DownloadedMediaItem {
    url: string;
    rid: string;
    name: string;
    timestamp: number;
}

interface MediaItemInfo {
    mediaItemRid: string;
    path: string;
    logicalTimestamp: number;
}

async function getMediaItemInfo(mediaSet: string, mediaItem: string) {
    const url = `https://tekuro.usw-16.palantirfoundry.com/mio/api/media-set/${mediaSet}/items/${mediaItem}/info`;
    const response = await client.auth.executeWithToken(token => {
        return fetch(url, {
            method: "GET",
            headers: {
                'accept': '*/*',
                Authorization: `Bearer ${token.accessToken}`,
            },
        });
    })

    if (response.status !== 200) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    return await response.json() as MediaItemInfo;
}

async function downloadMediaItem(mediaSet: string, mediaItem: string) {
    const url = `https://tekuro.usw-16.palantirfoundry.com/mio/api/media-set/${mediaSet}/items/${mediaItem}`;

    const response = await client.auth.executeWithToken(token => {
        return fetch(url, {
            method: "GET",
            headers: {
                'accept': '*/*',
                Authorization: `Bearer ${token.accessToken}`,
            },
        });
    })

    if (response.status !== 200) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    return await response.blob();
}

async function downloadMediaThumbnail(mediaSet: string, mediaItem: MediaItem): Promise<DownloadedMediaItem> {
    const url = `https://tekuro.usw-16.palantirfoundry.com/mio/api/image-set/${mediaSet}/items/${mediaItem.mediaItemRid}/thumbnail`;

    const response = await client.auth.executeWithToken(token => {
        return fetch(url, {
            method: "GET",
            headers: {
                'accept': '*/*',
                Authorization: `Bearer ${token.accessToken}`,
            },
        });
    });

    if (response.status !== 200) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const blob = await response.blob();
    return {
        rid: mediaItem.mediaItemRid,
        url: URL.createObjectURL(blob),
        name: mediaItem.path,
        timestamp: mediaItem.logicalTimestamp
    }
}

export default Home;
