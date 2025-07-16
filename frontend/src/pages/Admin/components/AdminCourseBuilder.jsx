import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "react-hot-toast"
import { IoAddCircleOutline } from "react-icons/io5"
import { useSelector } from "react-redux"
import { AiFillCaretDown } from "react-icons/ai"
import { FaPlus } from "react-icons/fa"
import { MdEdit } from "react-icons/md"
import { RiDeleteBin6Line } from "react-icons/ri"
import { RxDropdownMenu } from "react-icons/rx"

import { createSection, updateSection, deleteSection, createSubSection, updateSubSection, deleteSubSection, getFullDetailsOfCourse } from "../../../services/operations/courseDetailsAPI"
import ConfirmationModal from "../../../components/common/ConfirmationModal"
import AdminSubSectionModal from "./AdminSubSectionModal"

export default function AdminCourseBuilder({ course, onCourseUpdate }) {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm()
  const { token } = useSelector((state) => state.auth)
  
  const [loading, setLoading] = useState(false)
  const [editSectionName, setEditSectionName] = useState(null)
  const [courseData, setCourseData] = useState(course)
  const [originalCourseData, setOriginalCourseData] = useState(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSavingAll, setIsSavingAll] = useState(false)
  
  // States for SubSection Modal
  const [addSubSection, setAddSubsection] = useState(null)
  const [viewSubSection, setViewSubSection] = useState(null)
  const [editSubSection, setEditSubSection] = useState(null)
  const [confirmationModal, setConfirmationModal] = useState(null)

  // Fetch full course details with sections and subsections
  useEffect(() => {
    const fetchFullCourseDetails = async () => {
      if (course?._id && token) {
        try {
          setLoading(true)
          console.log("Fetching course details for course ID:", course._id)
          const fullCourseDetails = await getFullDetailsOfCourse(course._id, token)
          console.log("API Response:", fullCourseDetails)
          
          if (fullCourseDetails) {
            // Handle different response structures
            let courseData;
            if (fullCourseDetails.data && fullCourseDetails.data.courseDetails) {
              courseData = fullCourseDetails.data.courseDetails;
            } else if (fullCourseDetails.courseDetails) {
              courseData = fullCourseDetails.courseDetails;
            } else if (fullCourseDetails.data) {
              courseData = fullCourseDetails.data;
            } else {
              courseData = fullCourseDetails;
            }
            
            console.log("Processed course data:", courseData)
            console.log("Course content:", courseData.courseContent)
            
            setCourseData(courseData)
            setOriginalCourseData(JSON.parse(JSON.stringify(courseData))) // Deep copy for comparison
            setHasUnsavedChanges(false)
          } else {
            console.log("No course details returned, using original course data")
            setCourseData(course)
            setOriginalCourseData(JSON.parse(JSON.stringify(course)))
          }
        } catch (error) {
          console.error("Error fetching full course details:", error)
          console.error("Error details:", error.response?.data || error.message)
          setCourseData(course)
          setOriginalCourseData(JSON.parse(JSON.stringify(course)))
        } finally {
          setLoading(false)
        }
      } else {
        console.log("No course ID or token, using original course data")
        setCourseData(course)
        setOriginalCourseData(JSON.parse(JSON.stringify(course)))
        setLoading(false)
      }
    }

    fetchFullCourseDetails()
  }, [course, token])

  // Check for unsaved changes whenever courseData changes
  useEffect(() => {
    if (originalCourseData && courseData) {
      const hasChanges = JSON.stringify(originalCourseData.courseContent) !== JSON.stringify(courseData.courseContent)
      setHasUnsavedChanges(hasChanges)
    }
  }, [courseData, originalCourseData])

  // Handle form submission for section creation/update (local state only)
  const onSubmit = async (data) => {
    setLoading(true)

    try {
      if (editSectionName) {
        // Update section name locally
        const updatedCourseContent = courseData.courseContent.map((section) =>
          section._id === editSectionName 
            ? { ...section, sectionName: data.sectionName }
            : section
        )
        const updatedCourse = { ...courseData, courseContent: updatedCourseContent }
        setCourseData(updatedCourse)
        setEditSectionName(null)
        setValue("sectionName", "")
        // Remove toast - section name change is visible in UI
      } else {
        // Create new section locally
        const newSection = {
          _id: `temp_${Date.now()}`, // Temporary ID
          sectionName: data.sectionName,
          subSection: [],
          isNew: true // Flag to identify new sections
        }
        const updatedCourse = { 
          ...courseData, 
          courseContent: [...courseData.courseContent, newSection] 
        }
        setCourseData(updatedCourse)
        setValue("sectionName", "")
        // Remove toast - section addition is visible in UI
      }
    } catch (error) {
      console.error("Error with section operation:", error)
      toast.error("Failed to update section")
    } finally {
      setLoading(false)
    }
  }

  // Cancel edit mode
  const cancelEdit = () => {
    setEditSectionName(null)
    setValue("sectionName", "")
  }

  // Handle edit section name
  const handleChangeEditSectionName = (sectionId, sectionName) => {
    if (editSectionName === sectionId) {
      cancelEdit()
      return
    }
    setEditSectionName(sectionId)
    setValue("sectionName", sectionName)
  }

  // Delete Section (local state only)
  const handleDeleteSection = (sectionId) => {
    try {
      const updatedCourseContent = courseData.courseContent.filter(
        section => section._id !== sectionId
      )
      const updatedCourse = { ...courseData, courseContent: updatedCourseContent }
      setCourseData(updatedCourse)
      // Remove toast - section removal is visible in UI
    } catch (error) {
      console.error("Error deleting section:", error)
      toast.error("Failed to remove section")
    }
    setConfirmationModal(null)
  }

  // Delete SubSection (local state only)
  const handleDeleteSubSection = (subSectionId, sectionId) => {
    try {
      const updatedCourseContent = courseData.courseContent.map((section) =>
        section._id === sectionId 
          ? { 
              ...section, 
              subSection: section.subSection.filter(sub => sub._id !== subSectionId)
            }
          : section
      )
      const updatedCourse = { ...courseData, courseContent: updatedCourseContent }
      setCourseData(updatedCourse)
      // Remove toast - lecture removal is visible in UI
    } catch (error) {
      console.error("Error deleting subsection:", error)
      toast.error("Failed to remove lecture")
    }
    setConfirmationModal(null)
  }

  // Handle SubSection Modal Close and Update (local state only)
  const handleSubSectionUpdate = (updatedSubSection, sectionId, isNew = false) => {
    const updatedCourseContent = courseData.courseContent.map((section) => {
      if (section._id === sectionId) {
        if (isNew) {
          // Add new subsection
          const newSubSection = {
            ...updatedSubSection,
            _id: `temp_sub_${Date.now()}`,
            isNew: true
          }
          return {
            ...section,
            subSection: [...section.subSection, newSubSection]
          }
        } else {
          // Update existing subsection
          return {
            ...section,
            subSection: section.subSection.map(sub => 
              sub._id === updatedSubSection._id ? updatedSubSection : sub
            )
          }
        }
      }
      return section
    })
    
    const updatedCourse = { ...courseData, courseContent: updatedCourseContent }
    setCourseData(updatedCourse)
    setHasUnsavedChanges(true) // Explicitly set unsaved changes
    
    // Remove toasts - lecture changes are visible in UI with "(Unsaved)" indicators
  }

  // Save all changes to database
  const saveAllChanges = async () => {
    setIsSavingAll(true)
    
    
    try {
      // Process all changes sequentially
      let updatedContent = [...originalCourseData.courseContent]

      // 1. Handle new sections
      for (const section of courseData.courseContent) {
        if (section.isNew) {
          const result = await createSection({
            sectionName: section.sectionName,
            courseId: courseData._id,
          }, token)
          
          if (result && result.courseContent) {
            // Find the newly created section from the updated course content
            const newSection = result.courseContent.find(s => s.sectionName === section.sectionName)
            if (newSection) {
              // Handle new subsections in this new section
              for (const subSection of section.subSection) {
                if (subSection.isNew) {
                  const formData = new FormData()
                  formData.append("sectionId", newSection._id)
                  formData.append("title", subSection.title)
                  formData.append("description", subSection.description)
                  if (subSection.videoFile) {
                    formData.append("video", subSection.videoFile)
                  }
                  if (subSection.quiz) {
                    formData.append("quiz", subSection.quiz._id || subSection.quiz)
                  }
                  await createSubSection(formData, token)
                }
              }
            }
          }
        }
      }

      // 2. Handle section updates
      for (const section of courseData.courseContent) {
        if (!section.isNew) {
          const originalSection = originalCourseData.courseContent.find(s => s._id === section._id)
          if (originalSection && originalSection.sectionName !== section.sectionName) {
            await updateSection({
              sectionName: section.sectionName,
              sectionId: section._id,
              courseId: courseData._id,
            }, token)
          }
          
          // Handle subsection changes in existing sections
          for (const subSection of section.subSection) {
            if (subSection.isNew) {
              // New subsection in existing section
              const formData = new FormData()
              formData.append("sectionId", section._id)
              formData.append("title", subSection.title)
              formData.append("description", subSection.description)
              if (subSection.videoFile) {
                formData.append("video", subSection.videoFile)
              }
              if (subSection.quiz) {
                formData.append("quiz", subSection.quiz._id || subSection.quiz)
              }
              await createSubSection(formData, token)
            } else if (subSection.isModified) {
              // Update modified subsection
              const formData = new FormData()
              formData.append("sectionId", section._id)
              formData.append("subSectionId", subSection._id)
              formData.append("title", subSection.title)
              formData.append("description", subSection.description)
              if (subSection.videoFile) {
                formData.append("videoFile", subSection.videoFile)
              }
              if (subSection.quiz) {
                formData.append("quiz", subSection.quiz._id || subSection.quiz)
              }
              await updateSubSection(formData, token)
            }
          }
        }
      }

      // 3. Handle deleted sections
      for (const originalSection of originalCourseData.courseContent) {
        const stillExists = courseData.courseContent.find(s => s._id === originalSection._id)
        if (!stillExists) {
          await deleteSection({
            sectionId: originalSection._id,
            courseId: courseData._id,
          }, token)
        }
      }

      // 4. Handle deleted subsections
      for (const originalSection of originalCourseData.courseContent) {
        const currentSection = courseData.courseContent.find(s => s._id === originalSection._id)
        if (currentSection) {
          for (const originalSubSection of originalSection.subSection || []) {
            const stillExists = currentSection.subSection.find(s => s._id === originalSubSection._id)
            if (!stillExists) {
              await deleteSubSection({
                subSectionId: originalSubSection._id,
                sectionId: originalSection._id,
              }, token)
            }
          }
        }
      }

      // Refresh course data
      const result = await getFullDetailsOfCourse(courseData._id, token)
      if (result) {
        setCourseData(result)
        setOriginalCourseData(JSON.parse(JSON.stringify(result)))
        onCourseUpdate(result)
        setHasUnsavedChanges(false)
        toast.success("All changes saved successfully!")
      }

    } catch (error) {
      console.error("Error saving changes:", error)
      toast.error("Failed to save some changes. Please try again.")
    } finally {
      setIsSavingAll(false)
      
    }
  }

  // Discard all changes
  const discardChanges = () => {
    setConfirmationModal({
      text1: "Discard Changes?",
      text2: "All unsaved changes will be lost. This action cannot be undone.",
      btn1Text: "Discard",
      btn2Text: "Cancel",
      btn1Handler: () => {
        setCourseData(JSON.parse(JSON.stringify(originalCourseData)))
        setHasUnsavedChanges(false)
        // Remove toast - changes being discarded is obvious from UI reset
        setConfirmationModal(null)
      },
      btn2Handler: () => setConfirmationModal(null),
    })
  }

  return (
    <div className="space-y-8 rounded-2xl border-[1px] border-richblack-700 bg-richblack-800 p-6">
      <p className="text-2xl font-semibold text-richblack-5">Course Builder</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Section Name */}
        <div className="flex flex-col space-y-2">
          <label className="text-sm text-richblack-5" htmlFor="sectionName">
            Section Name <sup className="text-pink-200">*</sup>
          </label>
          <input
            id="sectionName"
            disabled={loading}
            placeholder="Add a section to build your course"
            {...register("sectionName", { required: true })}
            className="form-style w-full"
          />
          {errors.sectionName && (
            <span className="ml-2 text-xs tracking-wide text-pink-200">
              Section name is required
            </span>
          )}
        </div>

        {/* Create/Edit Section Button */}
        <div className="flex items-end gap-x-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-yellow-50 bg-transparent py-2 px-4 text-yellow-50 hover:bg-yellow-50 hover:text-richblack-900 transition-all duration-200"
          >
            <IoAddCircleOutline size={20} />
            {editSectionName ? "Edit Section Name" : "Create Section"}
          </button>
          {editSectionName && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-sm text-richblack-300 underline hover:text-richblack-5"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-50"></div>
          <span className="ml-2 text-richblack-5">Loading course content...</span>
        </div>
      )}

      {/* Nested View of Sections and SubSections */}
      {!loading && courseData?.courseContent?.length > 0 && (
        <div className="rounded-2xl bg-richblack-700 p-6 px-8">
          {courseData.courseContent.map((section) => (
            <details key={section._id} open>
              <summary className="flex cursor-pointer items-center justify-between border-b-2 border-b-richblack-600 py-2">
                <div className="flex items-center gap-x-3">
                  <RxDropdownMenu className="text-2xl text-richblack-50" />
                  <p className="font-semibold text-richblack-50">
                    {section.sectionName}
                    {section.isNew && <span className="ml-2 text-xs text-yellow-400">(Unsaved)</span>}
                  </p>
                </div>

                <div className="flex items-center gap-x-3">
                  <button
                    onClick={() =>
                      handleChangeEditSectionName(section._id, section.sectionName)
                    }
                    className="text-richblack-300 hover:text-richblack-5"
                  >
                    <MdEdit className="text-xl" />
                  </button>

                  <button
                    onClick={() =>
                      setConfirmationModal({
                        text1: "Delete this Section?",
                        text2: "All the lectures in this section will be deleted",
                        btn1Text: "Delete",
                        btn2Text: "Cancel",
                        btn1Handler: () => handleDeleteSection(section._id),
                        btn2Handler: () => setConfirmationModal(null),
                      })
                    }
                    className="text-richblack-300 hover:text-red-400"
                  >
                    <RiDeleteBin6Line className="text-xl" />
                  </button>

                  <span className="font-medium text-richblack-300">|</span>
                  <AiFillCaretDown className="text-xl text-richblack-300" />
                </div>
              </summary>

              <div className="px-6 pb-4">
                {/* Render All Sub Sections Within a Section */}
                {section.subSection?.map((data) => (
                  <div
                    key={data?._id}
                    onClick={() => setViewSubSection(data)}
                    className="flex cursor-pointer items-center justify-between gap-x-3 border-b-2 border-b-richblack-600 py-2 hover:bg-richblack-600 rounded px-2"
                  >
                    <div className="flex items-center gap-x-3 py-2">
                      <RxDropdownMenu className="text-2xl text-richblack-50" />
                      <p className="font-semibold text-richblack-50">
                        {data.title}
                        {data.isNew && <span className="ml-2 text-xs text-yellow-400">(Unsaved)</span>}
                      </p>
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-x-3"
                    >
                      <button
                        onClick={() =>
                          setEditSubSection({ ...data, sectionId: section._id })
                        }
                        className="text-richblack-300 hover:text-richblack-5"
                      >
                        <MdEdit className="text-xl" />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmationModal({
                            text1: "Delete this Lecture?",
                            text2: "This lecture will be deleted permanently",
                            btn1Text: "Delete",
                            btn2Text: "Cancel",
                            btn1Handler: () =>
                              handleDeleteSubSection(data._id, section._id),
                            btn2Handler: () => setConfirmationModal(null),
                          })
                        }
                        className="text-richblack-300 hover:text-red-400"
                      >
                        <RiDeleteBin6Line className="text-xl" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add New Lecture to Section */}
                <button
                  onClick={() => setAddSubsection(section._id)}
                  className="mt-3 flex items-center gap-x-1 text-yellow-50 hover:text-yellow-25 transition-colors"
                >
                  <FaPlus className="text-lg" />
                  <p>Add Lecture</p>
                </button>
              </div>
            </details>
          ))}
        </div>
      )}

      {/* No Content Message */}
      {!loading && (!courseData?.courseContent || courseData.courseContent.length === 0) && (
        <div className="text-center py-8 text-richblack-300">
          <p>No sections found. Create your first section to get started.</p>
        </div>
      )}

      {/* Save/Discard Changes Buttons */}
      {hasUnsavedChanges && (
        <div className="flex justify-end gap-x-4 mt-6 border-t border-richblack-700 pt-4">
          <button
            onClick={discardChanges}
            className="rounded-md bg-richblack-700 px-4 py-2 text-richblack-50 hover:bg-richblack-600"
          >
            Discard Changes
          </button>
          <button
            onClick={saveAllChanges}
            disabled={isSavingAll}
            className={`rounded-md px-4 py-2 text-richblack-900 ${
              isSavingAll 
                ? 'bg-yellow-100 cursor-not-allowed'
                : 'bg-yellow-50 hover:bg-yellow-100'
            }`}
          >
            {isSavingAll ? "Saving..." : "Save All Changes"}
          </button>
        </div>
      )}

      {/* SubSection Modals */}
      {addSubSection && (
        <AdminSubSectionModal
          modalData={addSubSection}
          setModalData={setAddSubsection}
          add={true}
          onUpdate={(updatedSubSection) => {
            handleSubSectionUpdate(updatedSubSection, addSubSection, true)
          }}
        />
      )}
      {viewSubSection && (
        <AdminSubSectionModal
          modalData={viewSubSection}
          setModalData={setViewSubSection}
          view={true}
          onUpdate={() => {}} // View mode doesn't need updates
        />
      )}
      {editSubSection && (
        <AdminSubSectionModal
          modalData={editSubSection}
          setModalData={setEditSubSection}
          edit={true}
          onUpdate={(updatedSubSection) => {
            handleSubSectionUpdate(updatedSubSection, editSubSection.sectionId, false)
          }}
        />
      )}

      {/* Confirmation Modal */}
      {confirmationModal && (
        <ConfirmationModal
          modalData={confirmationModal}
          closeModal={() => setConfirmationModal(null)}
        />
      )}
    </div>
  )
}
