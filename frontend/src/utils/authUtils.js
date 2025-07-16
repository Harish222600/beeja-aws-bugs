import { toast } from 'react-hot-toast';

// Utility function to clear authentication state
export const clearAuthState = () => {
  try {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Clear sessionStorage if used
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    
    // Show success message
    toast.success('Authentication cleared. Please login again.');
    
    // Reload the page to reset Redux state
    window.location.reload();
    
    return true;
  } catch (error) {
    console.error('Error clearing auth state:', error);
    toast.error('Error clearing authentication state');
    return false;
  }
};

// Function to check if user needs to re-authenticate
export const checkAuthValidity = async (token) => {
  if (!token) return false;
  
  try {
    const response = await fetch('http://localhost:5001/api/v1/admin/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.status !== 401;
  } catch (error) {
    console.error('Error checking auth validity:', error);
    return false;
  }
};
