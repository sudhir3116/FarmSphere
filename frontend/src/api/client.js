import axios from 'axios';

const normalizeApiBaseUrl = (value) => {
  const trimmed = value.trim().replace(/\/+$/, '');
  const withoutApiSuffix = trimmed.replace(/(?:\/api)+$/i, '');
  return `${withoutApiSuffix}/api`;
};

const resolveApiBaseUrl = () => {
  const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredApiUrl) {
    return normalizeApiBaseUrl(configuredApiUrl);
  }

  const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  if (configuredBackendUrl) {
    return normalizeApiBaseUrl(configuredBackendUrl);
  }

  return import.meta.env.PROD
    ? 'https://farmsphere-cy3k.onrender.com/api'
    : 'http://localhost:5001/api';
};

const API_BASE_URL = resolveApiBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getActiveToken = () => {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem('fpo_token') ||
    localStorage.getItem('fpo_token') ||
    sessionStorage.getItem('fpo_active_token') ||
    localStorage.getItem('fpo_farmer_token') ||
    localStorage.getItem('fpo_admin_token') ||
    null
  );
};

// Request Interceptor: Attach JWT Bearer Token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = getActiveToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Global Error Handling & 401 Auto-Logout
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      if (status === 401) {
        // Do NOT trigger global logout for login/auth attempts (which return 401 on bad credentials)
        const reqUrl = error.config?.url || '';
        const isAuthRequest =
          reqUrl.includes('/auth/login') ||
          reqUrl.includes('/auth/register') ||
          reqUrl.includes('/auth/google') ||
          reqUrl.includes('/auth/mobile/');

        if (!isAuthRequest) {
          console.warn('Session expired or unauthorized request:', data?.message);
          // Clear active session storage
          sessionStorage.removeItem('fpo_active_token');
          sessionStorage.removeItem('fpo_active_user');
          sessionStorage.removeItem('fpo_token');
          sessionStorage.removeItem('fpo_user');

          localStorage.removeItem('fpo_farmer_token');
          localStorage.removeItem('fpo_farmer_user');
          localStorage.removeItem('fpo_admin_token');
          localStorage.removeItem('fpo_admin_user');
          localStorage.removeItem('fpo_token');
          localStorage.removeItem('fpo_user');

          // Dispatch custom event so AuthContext can synchronize state
          window.dispatchEvent(new Event('fpo_auth_logout'));
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// API Service Contracts Grounded Strictly in Backend Specification

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (userData) => apiClient.post('/auth/register', userData),
  getMe: () => apiClient.get('/auth/me'),
  updateProfile: (profileData) => apiClient.put('/auth/profile', profileData),
  googleLogin: (tokenOrCredential) =>
    apiClient.post('/auth/google', {
      credential: tokenOrCredential,
      token: tokenOrCredential,
      idToken: tokenOrCredential,
    }),
};

export const assistantAPI = {
  query: ({ query, language }) => apiClient.post('/assistant/query', { query, language }),
};


export const loanAPI = {
  createLoan: (body) => apiClient.post('/loans', body),
  getAllLoans: (params) => apiClient.get('/loans', { params }),
  getMyLoans: () => apiClient.get('/loans/my'),
  getLoanById: (id) => apiClient.get(`/loans/${id}`),
  markUnderReview: (id) => apiClient.put(`/loans/${id}/under-review`),
  approveLoan: (id, body) => apiClient.put(`/loans/${id}/approve`, body),
  rejectLoan: (id, body) => apiClient.put(`/loans/${id}/reject`, body),
  disburseLoan: (id, body) => apiClient.put(`/loans/${id}/disburse`, body),
};

export const documentAPI = {
  uploadDocument: (formData) =>
    apiClient.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadKycDocument: (formData) =>
    apiClient.post('/documents/kyc-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getAllDocuments: (params) => apiClient.get('/documents', { params }),
  getMyDocuments: () => apiClient.get('/documents/my'),
  getLoanDocuments: (loanId) => apiClient.get(`/documents/loan/${loanId}`),
  getDocumentFile: (id) => apiClient.get(`/documents/${id}/file`, { responseType: 'blob' }),
  verifyDocument: (id) => apiClient.put(`/documents/${id}/verify`),
  rejectDocument: (id, body) => apiClient.put(`/documents/${id}/reject`, body),
};

export const repaymentAPI = {
  getAllRepayments: (params) => apiClient.get('/repayments', { params }),
  getMyRepayments: () => apiClient.get('/repayments/my'),
  getLoanRepayments: (loanId) => apiClient.get(`/repayments/loan/${loanId}`),
  markRepaymentPaid: (id, body) => apiClient.put(`/repayments/${id}/pay`, body),
};

export const auditAPI = {
  getAuditLogs: (params) => apiClient.get('/audit-logs', { params }),
};

export const loanProductAPI = {
  /** Farmer-facing: get all ACTIVE loan products */
  getActive: () => apiClient.get('/loan-products/active'),
  /** Admin: get all products with optional ?status= filter */
  getAll: (params) => apiClient.get('/loan-products', { params }),
  /** Admin: get single product by _id */
  getById: (id) => apiClient.get(`/loan-products/${id}`),
  /** Admin: create a new loan product */
  create: (body) => apiClient.post('/loan-products', body),
  /** Admin: update a product's fields */
  update: (id, body) => apiClient.put(`/loan-products/${id}`, body),
  /** Admin: toggle status / acceptingApplications */
  toggleStatus: (id, body) => apiClient.put(`/loan-products/${id}/status`, body),
};

export const adminAPI = {
  // Get all farmers with loans and documents
  getFarmers: (params) => apiClient.get('/admin/farmers', { params }),
  // Get farmers specifically for KYC review workflow
  getKycFarmers: (params) => apiClient.get('/admin/kyc/farmers', { params }),
  // Approve farmer KYC
  approveFarmerKyc: (farmerId) => apiClient.put(`/admin/kyc/${farmerId}/approve`),
  // Reject farmer KYC with mandatory reason
  rejectFarmerKyc: (farmerId, body) => apiClient.put(`/admin/kyc/${farmerId}/reject`, body),
  // Download farmer PDF report (admin only)
  downloadFarmerReport: (farmerId) => apiClient.get(`/admin/farmers/${farmerId}/report`, { responseType: 'blob' }),
};

