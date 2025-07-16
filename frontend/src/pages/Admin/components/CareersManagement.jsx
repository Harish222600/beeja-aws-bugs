import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { FaPlus, FaEdit, FaTrash, FaEye, FaUsers, FaBriefcase, FaCalendarAlt, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import {
  getAllJobs,
  createJob,
  updateJob,
  deleteJob,
  toggleJobPublication,
  getAllApplications,
  getJobsAnalytics
} from '../../../services/operations/jobsAPI';
import JobForm from './CareersManagement/JobForm';
import JobApplications from './CareersManagement/JobApplications';
import CareersAnalytics from './CareersManagement/CareersAnalytics';

const CareersManagement = () => {
  const { token } = useSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [selectedJobApplications, setSelectedJobApplications] = useState(null);

  // Fetch data on component mount
  useEffect(() => {
    fetchJobs();
    fetchApplications();
    fetchAnalytics();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      console.log('Fetching jobs with token:', token ? 'Token present' : 'No token');
      const result = await getAllJobs(token);
      console.log('Jobs fetch result:', result);
      setJobs(result || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to fetch jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    try {
      const result = await getAllApplications(token);
      setApplications(result || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const result = await getJobsAnalytics(token);
      setAnalytics(result);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const handleCreateJob = async (jobData) => {
    const result = await createJob(jobData, token);
    if (result) {
      await fetchJobs();
      await fetchAnalytics();
      setShowJobForm(false);
    }
  };

  const handleUpdateJob = async (jobData) => {
    const result = await updateJob(editingJob._id, jobData, token);
    if (result) {
      await fetchJobs();
      await fetchAnalytics();
      setShowJobForm(false);
      setEditingJob(null);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (window.confirm('Are you sure you want to delete this job? This will also delete all applications for this job.')) {
      const result = await deleteJob(jobId, token);
      if (result) {
        await fetchJobs();
        await fetchApplications();
        await fetchAnalytics();
      }
    }
  };

  const handleTogglePublication = async (jobId) => {
    const result = await toggleJobPublication(jobId, token);
    if (result) {
      await fetchJobs();
      await fetchAnalytics();
    }
  };

  const handleEditJob = (job) => {
    setEditingJob(job);
    setShowJobForm(true);
  };

  const handleViewApplications = (job) => {
    setSelectedJobApplications(job);
    setActiveTab('applications');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (isPublished, deadline) => {
    const isExpired = new Date() > new Date(deadline);
    
    if (isExpired) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Expired</span>;
    }
    
    if (isPublished) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Published (Visible on careers page)</span>;
    }
    
    return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Draft (Not visible on careers page)</span>;
  };

  const tabs = [
    { id: 'jobs', label: 'Job Listings', icon: <FaBriefcase /> },
    { id: 'applications', label: 'Applications', icon: <FaUsers /> },
    { id: 'analytics', label: 'Analytics', icon: <FaCalendarAlt /> }
  ];

  if (showJobForm) {
    return (
      <JobForm
        job={editingJob}
        onSubmit={editingJob ? handleUpdateJob : handleCreateJob}
        onCancel={() => {
          setShowJobForm(false);
          setEditingJob(null);
        }}
        loading={loading}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-richblack-5">Careers Management</h1>
          <p className="text-richblack-300 mt-1">Manage job postings and applications</p>
        </div>
        
        {activeTab === 'jobs' && (
          <button
            onClick={() => setShowJobForm(true)}
            className="flex items-center gap-2 bg-yellow-50 text-richblack-900 px-4 py-2 rounded-lg font-medium hover:bg-yellow-100 transition-colors"
          >
            <FaPlus />
            Add New Job
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-richblack-800 p-1 rounded-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-richblack-700 text-yellow-50'
                : 'text-richblack-300 hover:text-richblack-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-richblack-800 rounded-lg border border-richblack-700">
        {activeTab === 'jobs' && (
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-yellow-50 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12">
                <FaBriefcase className="mx-auto text-4xl text-richblack-400 mb-4" />
                <h3 className="text-lg font-medium text-richblack-100 mb-2">No jobs posted yet</h3>
                <p className="text-richblack-400 mb-4">Create your first job posting to get started</p>
                <button
                  onClick={() => setShowJobForm(true)}
                  className="bg-yellow-50 text-richblack-900 px-6 py-2 rounded-lg font-medium hover:bg-yellow-100 transition-colors"
                >
                  Create Job Posting
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <motion.div
                    key={job._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-richblack-700 rounded-lg p-6 border border-richblack-600"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-xl font-semibold text-richblack-5">{job.title}</h3>
                          {getStatusBadge(job.isPublished, job.applicationDeadline)}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-richblack-300 mb-3">
                          <span>📍 {job.location}</span>
                          <span>🏢 {job.department}</span>
                          <span>💼 {job.employmentType}</span>
                          <span>📅 Deadline: {formatDate(job.applicationDeadline)}</span>
                        </div>
                        
                        <p className="text-richblack-200 text-sm line-clamp-2 mb-3">
                          {job.description}
                        </p>
                        
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-richblack-400">
                            Applications: <span className="text-yellow-50 font-medium">{job.applicationCount || 0}</span>
                          </span>
                          <span className="text-richblack-400">
                            Created: {formatDate(job.createdAt)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTogglePublication(job._id)}
                          className={`p-2 rounded-lg transition-colors ${
                            job.isPublished
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-richblack-600 hover:bg-richblack-500 text-richblack-300'
                          }`}
                          title={job.isPublished ? 'Unpublish Job' : 'Publish Job'}
                        >
                          {job.isPublished ? <FaToggleOn /> : <FaToggleOff />}
                        </button>
                        
                        <button
                          onClick={() => handleViewApplications(job)}
                          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          title="View Applications"
                        >
                          <FaEye />
                        </button>
                        
                        <button
                          onClick={() => handleEditJob(job)}
                          className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                          title="Edit Job"
                        >
                          <FaEdit />
                        </button>
                        
                        <button
                          onClick={() => handleDeleteJob(job._id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                          title="Delete Job"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'applications' && (
          <JobApplications
            selectedJob={selectedJobApplications}
            applications={applications}
            onRefresh={fetchApplications}
          />
        )}

        {activeTab === 'analytics' && (
          <CareersAnalytics analytics={analytics} />
        )}
      </div>
    </div>
  );
};

export default CareersManagement;
