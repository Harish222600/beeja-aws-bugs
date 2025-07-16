import React from 'react'
import ProgressBar from "@ramonak/react-progress-bar"
import { RxCross2 } from "react-icons/rx"
import { FiUploadCloud, FiCheck, FiX } from "react-icons/fi"

const VideoUploadProgress = ({ 
  progress = 0, 
  fileName = '', 
  fileSize = 0, 
  status = 'uploading', // 'uploading', 'completed', 'error', 'cancelled'
  onCancel = null,
  error = null,
  isChunked = false,
  currentChunk = 0,
  totalChunks = 0
}) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <FiCheck className="text-green-400 text-xl" />
      case 'error':
      case 'cancelled':
        return <FiX className="text-red-400 text-xl" />
      default:
        return <FiUploadCloud className="text-blue-400 text-xl animate-pulse" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'completed':
        return 'Upload completed successfully'
      case 'error':
        return error || 'Upload failed'
      case 'cancelled':
        return 'Upload cancelled'
      default:
        if (isChunked && totalChunks > 0) {
          return `Uploading chunk ${currentChunk + 1} of ${totalChunks}...`
        }
        return 'Uploading video...'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'text-green-400'
      case 'error':
      case 'cancelled':
        return 'text-red-400'
      default:
        return 'text-blue-400'
    }
  }

  const getProgressBarColor = () => {
    switch (status) {
      case 'completed':
        return '#10B981' // green-500
      case 'error':
      case 'cancelled':
        return '#EF4444' // red-500
      default:
        return '#3B82F6' // blue-500
    }
  }

  return (
    <div className="bg-richblack-700 border border-richblack-600 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-richblack-5 truncate">
              {fileName}
            </p>
            <p className="text-xs text-richblack-300">
              {formatFileSize(fileSize)}
            </p>
          </div>
        </div>
        
        {/* Cancel button - only show during upload */}
        {status === 'uploading' && onCancel && (
          <button
            onClick={onCancel}
            className="p-1 hover:bg-richblack-600 rounded transition-colors"
            title="Cancel upload"
          >
            <RxCross2 className="text-richblack-400 hover:text-richblack-200 text-lg" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <ProgressBar
          completed={Math.min(progress, 100)}
          height="8px"
          bgColor={getProgressBarColor()}
          baseBgColor="#374151"
          borderRadius="4px"
          isLabelVisible={false}
          animateOnRender={true}
          transitionDuration="0.3s"
        />
        
        {/* Progress Info */}
        <div className="flex items-center justify-between text-xs">
          <span className={`${getStatusColor()} font-medium`}>
            {getStatusText()}
          </span>
          <span className="text-richblack-300">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Error Details */}
      {status === 'error' && error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded p-2">
          <p className="text-xs text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* Chunked Upload Info */}
      {isChunked && status === 'uploading' && totalChunks > 0 && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded p-2">
          <p className="text-xs text-blue-400">
            Large file detected - using chunked upload for better reliability
          </p>
        </div>
      )}
    </div>
  )
}

export default VideoUploadProgress
