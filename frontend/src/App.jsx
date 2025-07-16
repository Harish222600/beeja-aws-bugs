import { useEffect, useState } from "react";
import { Route, Routes, useLocation, Link } from "react-router-dom";
import { useSelector } from "react-redux";

import Toast from "./components/common/Toast";
import CourseCategories from "./components/core/Dashboard/AddCategory/CourseCategories";
import BundleAccessRequests from "./pages/Admin/components/BundleAccessRequests";
import Coupons from "./pages/Admin/Coupons";
import Orders from "./pages/Admin/components/Orders";
import StudentProgress from "./pages/Admin/components/StudentProgress/StudentProgress";
import Home from "./pages/Home"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";
import VerifyEmail from "./pages/VerifyEmail";
import VerifyCertificate from "./pages/VerifyCertificate";

import AdminRoutes from "./routes/AdminRoutes";
import AdminDashboard from "./pages/Admin/Dashboard";
import EnhancedAnalytics from "./pages/Admin/components/EnhancedAnalytics";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Faqs from "./pages/Faqs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Support from "./pages/Support";
import Courses from "./pages/Courses";
import FinalDynamicCareers from "./pages/FinalDynamicCareers";
import Resources from "./pages/Resources";
import Testimonials from "./pages/Testimonials";
import Partnership from "./pages/Partnership";
import Business from "./pages/Business";
import PressHours from "./pages/PressHours";
import PageNotFound from "./pages/PageNotFound";
import TestAnalytics from "./pages/TestAnalytics";
import CourseDetails from './pages/CourseDetails';
import Catalog from './pages/Catalog';
import InstituteService from "./pages/InstituteService";
import StudentService from "./pages/StudentService";
import FreeCourses from './components/core/Catalog/FreeCourses';

import ModernNavbar from "./components/common/Navbar"

import OpenRoute from "./components/core/Auth/OpenRoute"
import ProtectedRoute from "./components/core/Auth/ProtectedRoute";
import AuthChecker from "./components/common/AuthChecker";

import Dashboard from "./pages/Dashboard";
import MyProfile from "./components/core/Dashboard/MyProfile";
import Settings from "./components/core/Dashboard/Settings/Settings";
import MyCourses from './components/core/Dashboard/MyCourses';
import EditCourse from './components/core/Dashboard/EditCourse/EditCourse';
import Instructor from './components/core/Dashboard/Instructor';


import Cart from "./components/core/Dashboard/Cart/Cart";
import EnrolledCourses from "./components/core/Dashboard/EnrolledCourses";
import AddCourse from "./components/core/Dashboard/AddCourse/AddCourse";
import AccessRequests from "./components/core/Dashboard/AccessRequests";
import PurchaseHistory from "./components/core/Dashboard/PurchaseHistory/PurchaseHistory";
import Certificates from "./pages/Dashboard/Certificates";
import UserAnalytics from "./components/core/Dashboard/UserAnalytics";
import InstructorChats from "./pages/Dashboard/InstructorChats";
import AdminChats from "./pages/Dashboard/AdminChats";

import ViewCourse from "./pages/ViewCourse";
import BundleCheckout from "./pages/BundleCheckout";
import CourseCheckout from "./pages/CourseCheckout";
import VideoDetails from './components/core/ViewCourse/VideoDetails';
import QuizView from './components/core/ViewCourse/QuizView';

import { ACCOUNT_TYPE } from './utils/constants';

import { HiArrowNarrowUp } from "react-icons/hi"
import FaqButton from "./components/common/FaqButton"


function App() {

  const { user } = useSelector((state) => state.profile)

  // Scroll to the top of the page when the component mounts
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    scrollTo(0, 0);
  }, [location]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Go upward arrow - show , unshow
  const [showArrow, setShowArrow] = useState(false);

  const handleArrow = () => {
    if (window.scrollY > 500) {
      setShowArrow(true);
    } else setShowArrow(false);
  };

  useEffect(() => {
    window.addEventListener("scroll", handleArrow);
    return () => {
      window.removeEventListener("scroll", handleArrow);
    };
  }, [showArrow]);

  return (
    <div className="w-screen min-h-screen bg-richblack-900 flex flex-col font-inter pt-24">
      <ModernNavbar />
      <Toast />

      {/* go upward arrow */}
      <button
        onClick={() => window.scrollTo(0, 0)}
        className={`bg-yellow-25 hover:bg-yellow-50 hover:scale-110 p-3 text-lg text-black rounded-2xl fixed right-3 z-50 duration-500 ease-in-out ${
          showArrow ? "bottom-6" : "-bottom-24"
        } `}
      >
        <HiArrowNarrowUp />
      </button>

      {/* FAQ Button */}
      <FaqButton />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/faqs" element={<Faqs />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/support" element={<Support />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/careers" element={<FinalDynamicCareers />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/partnership" element={<Partnership />} />
        <Route path="/business" element={<Business />} />
        <Route path="/press-hours" element={<PressHours />} />
        <Route path="/home" element={<Home />} />
        <Route path="/community-courses" element={<Courses />} />
        <Route path="/services/institute" element={<InstituteService />} />
        <Route path="/services/student" element={<StudentService />} />
        <Route path="catalog/:catalogName" element={<Catalog />} />
        <Route path="free-courses" element={<FreeCourses />} />
        <Route path="courses/:courseId" element={<CourseDetails />} />
        <Route path="verify-certificate" element={<VerifyCertificate />} />
        <Route path="verify-certificate/:certificateId" element={<VerifyCertificate />} />
        <Route path="bundle-checkout" element={<BundleCheckout />} />
        <Route path="course-checkout" element={<CourseCheckout />} />

        {/* Open Route - for Only Non Logged in User */}
        <Route
          path="signup" element={
            <OpenRoute>
              <Signup />
            </OpenRoute>
          }
        />

        <Route
          path="login" element={
            <OpenRoute>
              <Login />
            </OpenRoute>
          }
        />

        <Route
          path="forgot-password" element={
            <OpenRoute>
              <ForgotPassword />
            </OpenRoute>
          }
        />

        <Route
          path="verify-email" element={
            <OpenRoute>
              <VerifyEmail />
            </OpenRoute>
          }
        />

        <Route
          path="update-password/:id" element={
            <OpenRoute>
              <UpdatePassword />
            </OpenRoute>
          }
        />




        {/* Protected Route - for Only Logged in User */}
        {/* Dashboard */}
        <Route element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
        >
          <Route path="dashboard/my-profile" element={<MyProfile />} />
          <Route path="dashboard/Settings" element={<Settings />} />

          {/* Route only for Students */}
          {/* cart , EnrolledCourses */}
          {user?.accountType === ACCOUNT_TYPE.STUDENT && (
            <>
              <Route path="dashboard/cart" element={<Cart />} />
              <Route path="dashboard/enrolled-courses" element={<EnrolledCourses />} />
              <Route path="dashboard/purchase-history" element={<PurchaseHistory />} />
              <Route path="dashboard/access-requests" element={<AccessRequests />} />
              <Route path="dashboard/certificates" element={<Certificates />} />
              <Route path="dashboard/user-analytics" element={<UserAnalytics />} />
            </>
          )}

          {/* Route only for Instructors */}
          {/* add course , MyCourses, EditCourse*/}
          {user?.accountType === ACCOUNT_TYPE.INSTRUCTOR && (
            <>
              <Route path="dashboard/instructor" element={<Instructor />} />
              <Route path="dashboard/my-courses" element={<MyCourses />} />
              <Route path="dashboard/edit-course/:courseId" element={<EditCourse />} />
              <Route path="dashboard/instructor-chats" element={<InstructorChats />} />
            </>
          )}

          {/* Route only for Admin */}
          {user?.accountType === ACCOUNT_TYPE.ADMIN && (
            <>
              <Route path="dashboard/admin/analytics" element={<EnhancedAnalytics />} />
              <Route path="dashboard/admin/categories" element={<CourseCategories />} />
              <Route path="dashboard/admin/bundle-requests" element={<BundleAccessRequests />} />
              <Route path="dashboard/admin/coupons" element={<Coupons />} />
              <Route path="dashboard/admin/orders" element={<Orders />} />
              <Route path="dashboard/admin/student-progress" element={<StudentProgress />} />
              <Route path="dashboard/admin/chats" element={<AdminChats />} />
            </>
          )}
        </Route>

        {/* Admin routes protected */}
        <Route element={<AdminRoutes />}>
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Route>

        {/* For the watching course lectures */}
        <Route
          element={
            <ProtectedRoute>
              <ViewCourse />
            </ProtectedRoute>
          }
        >
          {user?.accountType === ACCOUNT_TYPE.STUDENT && (
            <>
              <Route
                path="view-course/:courseId/section/:sectionId/sub-section/:subSectionId"
                element={<VideoDetails />}
              />
              <Route
                path="view-course/:courseId/section/:sectionId/sub-section/:subSectionId/quiz"
                element={<QuizView />}
              />
            </>
          )}
        </Route>




        {/* Test Route for Analytics */}
        <Route path="/test-analytics" element={<TestAnalytics />} />

        {/* Page Not Found (404 Page ) */}
        <Route path="*" element={<PageNotFound />} />

        </Routes>

      <AuthChecker />
    </div>
  );
}

export default App;
