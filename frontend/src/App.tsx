import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Router } from 'react-router-dom';
import { startTransition } from 'react';
import TutorialModal from './components/TutorialModal';

// Configure future flags
const router = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Feedback from './pages/Feedback';
import AdminFeedback from './pages/AdminFeedback';
import Profile from './pages/Profile';
import AgentDetails from './pages/AgentDetails';
import AgentBuilder from './pages/AgentBuilder';
import Conversation from './pages/Conversation';
import Analytics from './pages/Analytics';
import TeamAnalytics from './pages/TeamAnalytics';
import Teams from './pages/Teams';
import TeamBuilder from './pages/TeamBuilder';
import TeamDetails from './pages/TeamDetails';
import CollaborativeTaskExecution from './pages/CollaborativeTaskExecution';
import TaskResults from './pages/TaskResults';
import SearchPage from './pages/SearchPage';
import RequestsPage from './pages/RequestsPage';
import UserResourcesPage from './pages/UserResourcesPage';
import FeedbackDetail from './pages/FeedbackDetail';
import Collab from './pages/CollabMsg';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Checking login status...</div>
      </div>
    );
  }

  return (
    <BrowserRouter future={router.future}>
      <Routes>
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} 
        />
        <Route 
          path="/register" 
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />} 
        />
        <Route 
          path="/dashboard" 
          element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
        />
        <Route
          path="/feedback"
          element={isAuthenticated ? <Feedback /> : <Navigate to="/login" />}
        />

        <Route 
          path="/admin-feedback" 
          element={<AdminFeedback />} 
        /> 


        <Route 
          path="/profile"
          element={isAuthenticated ? <Profile /> : <Navigate to="/login" />}
        />

        <Route 
          path="/feedback-detail/:id" 
          element={<FeedbackDetail />} 
        />

        <Route 
          path="/feedback/:id" 
          element={<FeedbackDetail />} 
        />


        <Route 
          path="/agents/:id" 
          element={isAuthenticated ? <AgentDetails /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/builder" 
          element={isAuthenticated ? <AgentBuilder /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/conversation" 
          element={isAuthenticated ? <Conversation /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/analytics" 
          element={isAuthenticated ? <Analytics /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/team-analytics" 
          element={isAuthenticated ? <TeamAnalytics /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/teams" 
          element={isAuthenticated ? <Teams /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/teams/new" 
          element={isAuthenticated ? <TeamBuilder /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/teams/:teamId" 
          element={isAuthenticated ? <TeamDetails /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/teams/:teamId/tasks/:taskId" 
          element={isAuthenticated ? <TaskResults /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/teams/:teamId/tasks/:taskId/execute" 
          element={isAuthenticated ? <CollaborativeTaskExecution /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/search" 
          element={isAuthenticated ? <SearchPage /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/requests" 
          element={isAuthenticated ? <RequestsPage /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/users/:userId/resources" 
          element={isAuthenticated ? <UserResourcesPage /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/" 
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} 
        />
        <Route 
          path="/Collab" 
          element={isAuthenticated ? <Collab /> : <Navigate to="/login" />} 
        />
        <Route
          path="*"
          element={
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
              <div className="text-center">
                <div className="text-6xl font-bold text-gray-400 mb-4">404</div>
                <div className="text-xl text-gray-600 mb-4">Page not found</div>
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          }
        />
      </Routes>
      <TutorialModal />
    </BrowserRouter>
  );
}

export default App;