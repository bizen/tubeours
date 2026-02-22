'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './YouTubePlayer.module.css';

interface YouTubePlayerProps {
    videoId: string;
    startSeconds?: number;
    onEnd?: () => void;
    displayMode?: 'fill' | 'fit';
}

export default function YouTubePlayer({ videoId, startSeconds = 0, onEnd, displayMode = 'fill' }: YouTubePlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Load YouTube Iframe API if not loaded
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }

        const initPlayer = () => {
            if (!containerRef.current) return;

            playerRef.current = new window.YT.Player(containerRef.current, {
                videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0, // Minimal UI
                    disablekb: 1,
                    fs: 0,
                    modestbranding: 1,
                    rel: 0,
                    start: startSeconds,
                },
                events: {
                    onReady: () => setIsReady(true),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onStateChange: (event: any) => {
                        if (event.data === window.YT.PlayerState.ENDED) {
                            onEnd?.();
                        }
                    },
                },
            });
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = initPlayer;
        }

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
            }
        };
    }, [videoId, startSeconds, onEnd]);

    return (
        <div className={styles.playerWrapper}>
            <div className={`${styles.videoContainer} ${isReady ? styles.ready : ''} ${displayMode === 'fit' ? styles.fit : ''}`}>
                <div ref={containerRef} />
            </div>
        </div>
    );
}

declare global {
    interface Window {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}
