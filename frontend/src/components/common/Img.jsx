import React, { useMemo } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import 'react-lazy-load-image-component/src/effects/blur.css'

const Img = ({ src, className, alt, width, height }) => {
    // Function to transform Cloudinary URL for optimized delivery
    const getOptimizedUrl = useMemo(() => {
        if (!src || !src.includes('cloudinary.com')) return src;

        try {
            const baseUrl = src.split('/upload/')[0] + '/upload/';
            const imagePath = src.split('/upload/')[1];

            // Default transformations for all images
            const transformations = [
                'q_auto', // Automatic quality optimization
                'f_auto', // Automatic format selection based on browser
                'c_limit', // Limit mode for resizing
            ];

            // Add responsive sizing
            if (width) transformations.push(`w_${width}`);
            if (height) transformations.push(`h_${height}`);

            // Add transformations to URL
            return `${baseUrl}${transformations.join(',')}/${imagePath}`;
        } catch (error) {
            console.warn('Error optimizing image URL:', error);
            return src;
        }
    }, [src, width, height]);

    // Generate srcSet for responsive images
    const srcSet = useMemo(() => {
        if (!src || !src.includes('cloudinary.com')) return undefined;

        try {
            const baseUrl = src.split('/upload/')[0] + '/upload/';
            const imagePath = src.split('/upload/')[1];
            
            // Generate multiple sizes for responsive images
            const sizes = [200, 400, 600, 800];
            return sizes
                .map(size => {
                    const transformations = [
                        'q_auto',
                        'f_auto',
                        `w_${size}`,
                        'c_limit'
                    ].join(',');
                    return `${baseUrl}${transformations}/${imagePath} ${size}w`;
                })
                .join(', ');
        } catch (error) {
            console.warn('Error generating srcSet:', error);
            return undefined;
        }
    }, [src]);

    // Generate a tiny placeholder image
    const placeholderSrc = useMemo(() => {
        if (!src || !src.includes('cloudinary.com')) return undefined;

        try {
            const baseUrl = src.split('/upload/')[0] + '/upload/';
            const imagePath = src.split('/upload/')[1];
            
            // Create a tiny, blurred version for placeholder
            const transformations = [
                'w_20',
                'h_20',
                'q_10',
                'e_blur:1000',
                'f_auto'
            ].join(',');
            
            return `${baseUrl}${transformations}/${imagePath}`;
        } catch (error) {
            console.warn('Error generating placeholder:', error);
            return undefined;
        }
    }, [src]);

    return (
        <div className={`relative overflow-hidden ${className}`}>
            <LazyLoadImage
                className={className}
                alt={alt || 'Image'}
                effect="blur"
                src={getOptimizedUrl}
                srcSet={srcSet}
                sizes="(max-width: 640px) 200px, (max-width: 768px) 400px, (max-width: 1024px) 600px, 800px"
                placeholderSrc={placeholderSrc}
                threshold={100}
                beforeLoad={() => {
                    // Return tiny placeholder before loading
                    return placeholderSrc;
                }}
                loading="lazy"
                decoding="async"
                style={{
                    minHeight: '100%',
                    background: '#1f2937', // Rich black background
                    transition: 'opacity 0.3s ease-in-out'
                }}
            />
        </div>
    )
}

export default React.memo(Img)
