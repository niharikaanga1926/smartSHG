import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './context/AuthContext';

import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ForgotPassword } from './pages/auth/ForgotPassword';

import { DashboardRouter } from './pages/dashboard/DashboardRouter';
import { MemberList } from './pages/members/MemberList';
import { SavingsList } from './pages/savings/SavingsList';
import { LedgerList } from './pages/cash-bank/LedgerList';
import { LoanList } from './pages/loans/LoanList';
import { MeetingList } from './pages/meetings/MeetingList';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-slate-600">
            Loading SmartSHG...
          </p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const App = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
        }
      />

      <Route
        path="/register"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />
        }
      />

      <Route
        path="/forgot-password"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <ForgotPassword />
          )
        }
      />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRouter />
          </ProtectedRoute>
        }
      />

      <Route
        path="/members"
        element={
          <ProtectedRoute>
            <MemberList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/savings"
        element={
          <ProtectedRoute>
            <SavingsList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cash-bank"
        element={
          <ProtectedRoute>
            <LedgerList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/loans"
        element={
          <ProtectedRoute>
            <LoanList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/meetings"
        element={
          <ProtectedRoute>
            <MeetingList />
          </ProtectedRoute>
        }
      />

      {/* Default */}
      <Route
        path="/"
        element={
          <Navigate
            to={isAuthenticated ? '/dashboard' : '/login'}
            replace
          />
        }
      />

      {/* Unknown routes */}
      <Route
        path="*"
        element={
          <Navigate
            to={isAuthenticated ? '/dashboard' : '/login'}
            replace
          />
        }
      />
    </Routes>
  );
};

export default App;