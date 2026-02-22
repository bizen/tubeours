import { useState, useCallback } from 'react';

// Common Hook for managing YouTube Iframe Player programmatically
export function useYouTubePlayer(videoIds: string[], initialIndex: number = 0) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    const nextVideo = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % videoIds.length);
    }, [videoIds.length]);

    const previousVideo = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + videoIds.length) % videoIds.length);
    }, [videoIds.length]);

    const currentVideoId = videoIds[currentIndex] || '';

    return {
        currentVideoId,
        currentIndex,
        isPlaying,
        progress,
        setIsPlaying,
        setProgress,
        nextVideo,
        previousVideo,
        setCurrentIndex,
    };
}
