import { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert, Avatar } from '@mui/material';
import { Person, Email, Edit, Save, Cancel } from '@mui/icons-material';
import { useAuthStore } from '@/store/authStore';
import axios from '@/utils/axios';

export const ProfilePage = () => {
  const { user } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    email: user?.email || '',
    full_name: user?.full_name || '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        full_name: user.full_name || '',
      });
    }
  }, [user]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    setError('');
    setSuccess(false);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await axios.put('/auth/profile', formData);
      // Update user in auth store
      useAuthStore.getState().updateUser(response.data);
      setSuccess(true);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      email: user?.email || '',
      full_name: user?.full_name || '',
    });
    setIsEditing(false);
    setError('');
    setSuccess(false);
  };

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Person sx={{ fontSize: 40, color: '#2563eb' }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            My Profile
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your personal information
          </Typography>
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(false)}>
          Profile updated successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          p: 4,
          borderRadius: 3,
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
          <Avatar
            sx={{
              width: 80,
              height: 80,
              bgcolor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </Avatar>
          <Box sx={{ ml: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {user?.username}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.role?.name || 'User'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Username"
            value={user?.username || ''}
            disabled
            fullWidth
            InputProps={{
              startAdornment: <Person sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
            helperText="Username cannot be changed"
          />

          <TextField
            label="Full Name"
            value={formData.full_name}
            onChange={handleChange('full_name')}
            disabled={!isEditing}
            fullWidth
            InputProps={{
              startAdornment: <Person sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />

          <TextField
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            disabled={!isEditing}
            fullWidth
            InputProps={{
              startAdornment: <Email sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />

          <TextField
            label="Role"
            value={user?.role?.name || 'User'}
            disabled
            fullWidth
            helperText="Role is managed by administrators"
          />

          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            {!isEditing ? (
              <Button
                variant="contained"
                startIcon={<Edit />}
                onClick={() => setIsEditing(true)}
                sx={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5568d3 0%, #653a8b 100%)',
                  },
                }}
              >
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={handleSave}
                  disabled={loading}
                  sx={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5568d3 0%, #653a8b 100%)',
                    },
                  }}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Cancel />}
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};
