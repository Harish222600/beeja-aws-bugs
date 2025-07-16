import { useEffect, useRef, useState } from "react"
import { useDropzone } from "react-dropzone"
import { FiUploadCloud } from "react-icons/fi"
import { useSelector } from "react-redux"

// Removed video-react to eliminate legacy context API warning



export default function Upload({ name, label, register, setValue, errors, video = false, viewData = null, editData = null, setImageFile = null }) {
  const { token } = useSelector((state) => state.auth)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewSource, setPreviewSource] = useState("")
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const inputRef = useRef(null)
  const videoRef = useRef(null)

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0]
    if (file) {
      console.log("File dropped:", {
        name: file.name,
        type: file.type,
        size: file.size
      })
      previewFile(file)
      setSelectedFile(file)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: !video
      ? { "image/*": [".jpeg", ".jpg", ".png"] }
      : { "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"] },
    onDrop,
    maxSize: video ? undefined : 10 * 1024 * 1024, // 10MB for images, unlimited for videos
    noClick: false, // Enable click behavior on the entire dropzone
    noKeyboard: true, // Disable keyboard events to prevent conflicts
  })

  // Handle browse button click
  const handleBrowseClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("Browse button clicked, triggering file input")
    
    // Create a new file input element if ref doesn't work
    if (inputRef.current) {
      console.log("File input ref found, triggering click")
      try {
        inputRef.current.click()
      } catch (error) {
        console.error("Error clicking file input:", error)
        // Fallback: create a temporary file input
        createTemporaryFileInput()
      }
    } else {
      console.error("File input ref not found, creating temporary input")
      createTemporaryFileInput()
    }
  }

  // Fallback method to create temporary file input
  const createTemporaryFileInput = () => {
    const tempInput = document.createElement('input')
    tempInput.type = 'file'
    tempInput.accept = !video ? "image/*" : "video/*"
    tempInput.style.display = 'none'
    
    tempInput.onchange = (e) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const file = files[0]
        console.log("Selected file via temporary input:", {
          name: file.name,
          type: file.type,
          size: file.size
        })
        onDrop([file])
      }
      // Clean up
      document.body.removeChild(tempInput)
    }
    
    document.body.appendChild(tempInput)
    tempInput.click()
  }

  const previewFile = (file) => {
    setIsLoadingPreview(true)
    setPreviewError(null)
    
    if (video) {
      // For video files, create object URL for better performance
      try {
        const objectUrl = URL.createObjectURL(file)
        setPreviewSource(objectUrl)
        setIsLoadingPreview(false)
        
        // Clean up the object URL when component unmounts or file changes
        return () => URL.revokeObjectURL(objectUrl)
      } catch (error) {
        console.error("Error creating object URL:", error)
        setPreviewError("Failed to preview video")
        setIsLoadingPreview(false)
      }
    } else {
      // For images, use FileReader as before
      const reader = new FileReader()
      reader.onloadstart = () => setIsLoadingPreview(true)
      reader.onloadend = () => {
        setPreviewSource(reader.result)
        setIsLoadingPreview(false)
      }
      reader.onerror = () => {
        setPreviewError("Failed to preview image")
        setIsLoadingPreview(false)
      }
      reader.readAsDataURL(file)
    }
  }

  useEffect(() => {
    register(name, { required: !video }) // Make video upload optional
  }, [register, video])

  useEffect(() => {
    if (selectedFile) {
      setValue(name, selectedFile)
      if (setImageFile) {
        setImageFile(selectedFile)
      }
      console.log("Selected file set in form:", {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size
      })
    }
  }, [selectedFile, setValue, name, setImageFile])

  // Handle initial video URL validation for edit/view mode
  useEffect(() => {
    const initialVideoUrl = viewData || editData
    if (initialVideoUrl && video && !selectedFile) {
      console.log("Processing initial video URL:", initialVideoUrl)
      setIsLoadingPreview(true)
      
      // Check if it's a Supabase URL that needs special handling
      if (initialVideoUrl.includes('supabase') || initialVideoUrl.includes('storage')) {
        console.log("Detected Supabase video URL, using direct URL")
        // For Supabase URLs, try to use them directly first
        setPreviewSource(initialVideoUrl)
        setIsLoadingPreview(false)
      } else if (initialVideoUrl.includes('http')) {
        // For other HTTP URLs, test accessibility
        const testVideo = document.createElement('video')
        testVideo.preload = 'metadata'
        
        testVideo.onloadedmetadata = () => {
          console.log("Video URL is valid and accessible")
          setPreviewSource(initialVideoUrl)
          setPreviewError(null)
          setIsLoadingPreview(false)
        }
        
        testVideo.onerror = (e) => {
          console.error("Video URL failed to load:", e)
          setPreviewError("Video file not found or inaccessible")
          setPreviewSource("")
          setIsLoadingPreview(false)
        }
        
        testVideo.src = initialVideoUrl
      } else {
        // For other formats, assume it's a video ID and construct streaming URL
        console.log("Assuming video ID, constructing streaming URL")
        let videoId = initialVideoUrl
        
        // Remove _manifest suffix if present
        if (videoId.endsWith('_manifest')) {
          videoId = videoId.replace('_manifest', '')
        }
        
        const streamingUrl = `http://localhost:5001/api/v1/video/stream/${videoId}?token=${token}`
        setPreviewSource(streamingUrl)
        setIsLoadingPreview(false)
      }
    }
  }, [viewData, editData, video, selectedFile, token])

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewSource && previewSource.startsWith('blob:')) {
        URL.revokeObjectURL(previewSource)
      }
    }
  }, [previewSource])

  return (
    <div className="flex flex-col space-y-2">
      <label className="text-sm text-richblack-5" htmlFor={name}>
        {label} {!viewData && !video && <sup className="text-pink-200">*</sup>}
        {video && <span className="text-xs text-richblack-300 ml-2">(optional)</span>}
      </label>

      <div
        className={`${
          isDragActive ? "border-yellow-50 bg-richblack-600" : "border-richblack-500 bg-richblack-700"
        } relative flex min-h-[200px] cursor-pointer items-center justify-center rounded-md border-2 border-dashed transition-all duration-200 hover:border-yellow-50`}
      >
        {isLoadingPreview ? (
          <div className="flex flex-col items-center justify-center p-4">
            <div className="w-8 h-8 border-2 border-yellow-50 border-t-transparent rounded-full animate-spin mb-2"></div>
            <p className="text-sm text-richblack-200">Loading preview...</p>
          </div>
        ) : previewError ? (
          <div className="flex flex-col items-center justify-center p-4">
            <p className="text-sm text-pink-200 mb-2">⚠️ {previewError}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewError(null)
                  setPreviewSource("")
                  setSelectedFile(null)
                  setValue(name, null)
                }}
                className="text-sm text-yellow-50 underline hover:text-yellow-100"
              >
                Upload new {video ? "video" : "image"}
              </button>
              {(viewData || editData) && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewError(null)
                    setIsLoadingPreview(true)
                    
                    // Try different URL formats
                    const originalUrl = viewData || editData
                    console.log("Retrying with original URL:", originalUrl)
                    
                    if (originalUrl.includes('supabase')) {
                      // Try direct Supabase URL first
                      setPreviewSource(originalUrl)
                      setIsLoadingPreview(false)
                    } else if (token) {
                      // Try streaming endpoint
                      let videoId = originalUrl
                      
                      // If it's a Supabase manifest URL, extract the video ID
                      if (originalUrl.includes('supabase') && originalUrl.includes('manifest')) {
                        const urlParts = originalUrl.split('/')
                        videoId = urlParts[urlParts.length - 1].split('.')[0]
                        
                        // Remove _manifest suffix if present
                        if (videoId.endsWith('_manifest')) {
                          videoId = videoId.replace('_manifest', '')
                        }
                      }
                      
                      const streamingUrl = `http://localhost:5001/api/v1/video/stream/${videoId}?token=${token}`
                      console.log("Trying streaming URL:", streamingUrl)
                      setPreviewSource(streamingUrl)
                      setIsLoadingPreview(false)
                    } else {
                      setPreviewSource(originalUrl)
                      setIsLoadingPreview(false)
                    }
                  }}
                  className="text-sm text-richblack-300 underline hover:text-richblack-100"
                >
                  Retry loading
                </button>
              )}
            </div>
          </div>
        ) : previewSource ? (
          <div className="flex w-full flex-col p-4 md:p-6">
            {!video ? (
              <img
                src={previewSource}
                alt="Preview"
                className="h-full w-full rounded-md object-cover"
                onError={() => setPreviewError("Failed to load image preview")}
              />
            ) : (
              <div className="relative aspect-video w-full">
                <video 
                  ref={videoRef}
                  className="h-full w-full rounded-md object-cover" 
                  controls
                  playsInline 
                  preload="metadata"
                  src={previewSource}
                  crossOrigin="anonymous"
                  onError={(e) => {
                    console.error("Video preview error:", e)
                    console.error("Failed URL:", previewSource)
                    
                    // If it's a Supabase URL that failed, try alternative approaches
                    if (previewSource.includes('supabase') && !previewSource.includes('/stream/')) {
                      console.log("Supabase URL failed, trying to extract video ID")
                      // Try to extract video ID from URL and use streaming endpoint
                      const urlParts = previewSource.split('/')
                      let possibleVideoId = urlParts[urlParts.length - 1].split('.')[0]
                      
                      // Remove _manifest suffix if present
                      if (possibleVideoId.endsWith('_manifest')) {
                        possibleVideoId = possibleVideoId.replace('_manifest', '')
                      }
                      
                      if (possibleVideoId && token) {
                        const streamingUrl = `http://localhost:5001/api/v1/video/stream/${possibleVideoId}?token=${token}`
                        console.log("Trying streaming URL:", streamingUrl)
                        setPreviewSource(streamingUrl)
                        return
                      }
                    }
                    
                    setPreviewError("Failed to load video preview")
                    setPreviewSource("")
                  }}
                  onLoadedMetadata={() => {
                    console.log("Video metadata loaded successfully for:", previewSource)
                    setPreviewError(null)
                  }}
                  onLoadStart={() => {
                    console.log("Video loading started for:", previewSource)
                  }}
                >
                  Your browser does not support the video tag.
                </video>
                {selectedFile && (
                  <div className="absolute bottom-2 right-2 rounded bg-richblack-800 px-2 py-1 text-xs text-richblack-50">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                )}
                {!selectedFile && (viewData || editData) && (
                  <div className="absolute bottom-2 right-2 rounded bg-richblack-800 px-2 py-1 text-xs text-richblack-50">
                    Existing Video
                  </div>
                )}
              </div>
            )}

            {!viewData && (
              <button
                type="button"
                onClick={() => {
                  // Clean up object URL if it exists
                  if (previewSource && previewSource.startsWith('blob:')) {
                    URL.revokeObjectURL(previewSource)
                  }
                  setPreviewSource("")
                  setSelectedFile(null)
                  setPreviewError(null)
                  setValue(name, null)
                }}
                className="mt-3 text-sm font-medium text-richblack-400 underline hover:text-yellow-50"
              >
                {selectedFile ? 'Remove' : 'Replace'} {video ? "Video" : "Image"}
              </button>
            )}
          </div>
        ) : (
          <div
            className="flex w-full flex-col items-center p-4 md:p-6"
            {...getRootProps()}
          >
            {/* Use dropzone input for both drag and click functionality */}
            <input {...getInputProps()} />
            <div className="grid aspect-square w-14 place-items-center rounded-full bg-richblack-800 transition-all duration-200 hover:bg-richblack-700">
              <FiUploadCloud className="text-2xl text-yellow-50" />
            </div>
            <p className="mt-2 max-w-[200px] text-center text-sm text-richblack-200">
              Drag and drop {!video ? "an image" : "a video"}, or{" "}
              <span 
                className="font-semibold text-yellow-50 cursor-pointer hover:text-yellow-100 transition-colors"
                onClick={handleBrowseClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleBrowseClick(e)
                  }
                }}
              >
                browse
              </span>
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-richblack-200">
              {video ? (
                <>
                  <li className="flex items-center gap-1">
                    <span>•</span> Formats: MP4, MOV, AVI, MKV, WebM
                  </li>
                  <li className="flex items-center gap-1">
                    <span>•</span> No size limit
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-1">
                    <span>•</span> Aspect ratio 16:9
                  </li>
                  <li className="flex items-center gap-1">
                    <span>•</span> Recommended: 1024x576
                  </li>
                </>
              )}
            </ul>
          </div>
        )}
      </div>

      {errors[name] && (
        <span className="flex items-center text-xs text-pink-200">
          <span className="mr-1">⚠️</span>
          {label} is required
        </span>
      )}
    </div>
  )
}
