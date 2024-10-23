import css from "./Home.module.css";
import '@mantine/dropzone/styles.css';

import { Dropzone, FileWithPath } from "@mantine/dropzone";
import React from "react";
import { IconPhoto } from "@tabler/icons-react";
import client from "./client";
import { mediaSet } from "./Home";

interface MediaWriteResponse {
    mediaItemRid: string;
}

export const ImageDropZone = React.memo<{
    setEncodedImage: (value: string) => void;
    setUploadedImageUrl: (value: string) => void;
    setUploadedMediaItem: (value: string) => void; 
    setLoadingInput: (value: boolean) => void;
}>(function _imageDrop({setEncodedImage, setUploadedImageUrl, setUploadedMediaItem, setLoadingInput}) {

    // todo make this useEffect to cleanup the object url
    const handleDrop = async (files: FileWithPath[]): Promise<void> => {
        setLoadingInput(true);
        if (files.length != 1) {
            throw new Error("Multi-file uploads not yet supported");
        }

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const content = event.target?.result;
                if (content) {
                    try {
                        setEncodedImage(arrayBufferToBase64(content as ArrayBuffer)); // this is likely not good
                        const blob = new Blob([content], { type: 'image/png' });
                        setUploadedImageUrl(URL.createObjectURL(blob));
                        setLoadingInput(false);
                        const url = `https://tekuro.usw-16.palantirfoundry.com/mio/api/media-set/${mediaSet}/items?mediaItemPath=${file.name}&mediaSetBranch=master`
                        let response = await client.auth.executeWithToken(token => {
                            return fetch(url, {
                                method: "PUT",
                                headers: {
                                    'Content-Type': 'application/octet-stream',
                                    Authorization: `Bearer ${token.accessToken}`,
                                },
                                body: content,
                            });
                        })
                        if (!response.ok) {
                            throw new Error(`Upload failed: ${response.statusText}`);
                        }
                        const writeResponse = await response.json() as MediaWriteResponse;
                        setUploadedMediaItem(writeResponse.mediaItemRid);
                    } catch (error) {
                        console.error("Error uploading file", error);
                    }
                }
            }

            reader.onerror = (error) => {
                console.error("Error reading file", error);
            };
            reader.readAsArrayBuffer(file);
        });
    }


    return (
        <Dropzone onDrop={handleDrop} className={css.dropzone}>
            <div className={css.imageDropText}>
                <IconPhoto />
                <span>Drag or select an image to detect fraud</span>
            </div>
        </Dropzone>
    );

});


export function arrayBufferToBase64(buffer: ArrayBuffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

