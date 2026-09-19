import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Grid,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Pagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MedicalServices as MedicalServicesIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Build as BuildIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/auth';

interface Device {
  id: number;
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  department: string;
  status: string;
  location: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  last_maintenance: string | null;
  health_score: number;
  notes: string | null;
}

const deviceTypes = [
  'ventilator',
  'patient_monitor',
  'syringe_pump',
  'infusion_pump',
  'defibrillator',
  'ecg_machine',
  'ultrasound',
  'xray_machine',
  'mri_machine',
  'ct_scanner',
];

const deviceStatuses = [
  'operational',
  'maintenance_required',
  'under_maintenance',
  'out_of_service',
  'retired',
];

const departments = [
  'ICU',
  'CCU',
  'NICU',
  'OR',
  'ER',
  'General Ward',
  'Radiology',
  'Laboratory',
];

const statusColors: Record<string, string> = {
  operational: '#4caf50',
  maintenance_required: '#ff9800',
  under_maintenance: '#2196f3',
  out_of_service: '#f44336',
  retired: '#9e9e9e',
};

const statusIcons: Record<string, React.ReactElement> = {
  operational: <CheckCircleIcon />,
  maintenance_required: <BuildIcon />,
  under_maintenance: <BuildIcon />,
  out_of_service: <WarningIcon />,
  retired: <DeleteIcon />,
};

const formatEnumLabel = (value: string) => value.replace(/_/g, ' ').toUpperCase();

const getApiErrorMessage = (error: any) => {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => `${item.loc?.slice(1).join('.') || 'field'}: ${item.msg}`)
      .join('، ');
  }
  if (typeof detail === 'string') return detail;
  return 'تعذر حفظ الجهاز. تحقق من البيانات وحاول مجدداً / Failed to save device';
};

export default function DevicesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'patient_monitor',
    manufacturer: '',
    model: '',
    serial_number: '',
    department: 'ICU',
    status: 'operational',
    location: '',
    purchase_date: '',
    warranty_expiry: '',
    notes: '',
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchDevices();
  }, [isAuthenticated, navigate, page]);

  const fetchDevices = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/devices/?skip=${(page - 1) * 10}&limit=10`);
      setDevices(response.data);
      setLoading(false);
    } catch (err: any) {
      setError('Failed to fetch devices');
      setLoading(false);
    }
  };

  const handleOpenDialog = (device?: Device) => {
    if (device) {
      setEditingDevice(device);
      setFormData({
        name: device.name,
        type: device.type,
        manufacturer: device.manufacturer,
        model: device.model,
        serial_number: device.serial_number,
        department: device.department,
        status: device.status,
        location: device.location || '',
        purchase_date: device.purchase_date ? device.purchase_date.split('T')[0] : '',
        warranty_expiry: device.warranty_expiry ? device.warranty_expiry.split('T')[0] : '',
        notes: device.notes || '',
      });
    } else {
      setEditingDevice(null);
      setFormData({
        name: '',
        type: 'patient_monitor',
        manufacturer: '',
        model: '',
        serial_number: '',
        department: 'ICU',
        status: 'operational',
        location: '',
        purchase_date: '',
        warranty_expiry: '',
        notes: '',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingDevice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...formData,
      location: formData.location.trim() || null,
      purchase_date: formData.purchase_date || null,
      warranty_expiry: formData.warranty_expiry || null,
      notes: formData.notes.trim() || null,
    };
    try {
      if (editingDevice) {
        await api.put(`/api/devices/${editingDevice.id}`, payload);
      } else {
        await api.post('/api/devices/', payload);
      }
      handleCloseDialog();
      await fetchDevices();
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this device?')) {
      try {
        await api.delete(`/api/devices/${id}`);
        fetchDevices();
      } catch (err: any) {
        setError('Failed to delete device');
      }
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return '#4caf50';
    if (score >= 60) return '#ff9800';
    return '#f44336';
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={() => navigate('/dashboard')}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h4" component="h1">
              الأجهزة الطبية
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Medical Devices
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)' }}
          >
            إضافة جهاز / Add Device
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Grid container spacing={3}>
              {devices.map((device) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={device.id}>
                  <Card
                    sx={{
                      height: '100%',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                      },
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <MedicalServicesIcon sx={{ fontSize: 40, color: '#e53935' }} />
                        <Chip
                          icon={statusIcons[device.status]}
                          label={formatEnumLabel(device.status)}
                          sx={{
                            backgroundColor: statusColors[device.status],
                            color: 'white',
                            fontSize: '0.75rem',
                          }}
                        />
                      </Box>
                      <Typography variant="h6" component="div" gutterBottom noWrap>
                        {device.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {device.manufacturer} {device.model}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {device.serial_number}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {device.department}
                      </Typography>
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Health Score:
                        </Typography>
                        <Box
                          sx={{
                            width: '100%',
                            height: 8,
                            backgroundColor: '#e0e0e0',
                            borderRadius: 4,
                            mt: 0.5,
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            sx={{
                              width: `${device.health_score}%`,
                              height: '100%',
                              backgroundColor: getHealthScoreColor(device.health_score),
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {device.health_score}%
                        </Typography>
                      </Box>
                    </CardContent>
                    <CardActions>
                      <Button size="small" onClick={() => handleOpenDialog(device)} startIcon={<EditIcon />}>
                        تعديل / Edit
                      </Button>
                      <Button size="small" color="error" onClick={() => handleDelete(device.id)} startIcon={<DeleteIcon />}>
                        حذف / Delete
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
              />
            </Box>
          </>
        )}

        <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            {editingDevice ? 'تعديل جهاز / Edit Device' : 'إضافة جهاز جديد / Add New Device'}
          </DialogTitle>
          <DialogContent>
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="اسم الجهاز / Device Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="نوع الجهاز / Device Type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    required
                    margin="normal"
                  >
                    {deviceTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {formatEnumLabel(type)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="الشركة المصنعة / Manufacturer"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="الموديل / Model"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="الرقم التسلسلي / Serial Number"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="القسم / Department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    required
                    margin="normal"
                  >
                    {departments.map((dept) => (
                      <MenuItem key={dept} value={dept}>
                        {dept}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="الحالة / Status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    required
                    margin="normal"
                  >
                    {deviceStatuses.map((status) => (
                      <MenuItem key={status} value={status}>
                        {formatEnumLabel(status)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="الموقع / Location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="تاريخ الشراء / Purchase Date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                    margin="normal"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="نهاية الضمان / Warranty Expiry"
                    value={formData.warranty_expiry}
                    onChange={(e) => setFormData({ ...formData, warranty_expiry: e.target.value })}
                    margin="normal"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="ملاحظات / Notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>إلغاء / Cancel</Button>
            <Button onClick={handleSubmit} variant="contained">
              {editingDevice ? 'حفظ التعديلات / Save Changes' : 'إضافة / Add'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}
