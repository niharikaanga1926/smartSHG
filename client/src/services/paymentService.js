import api from './api';

export const paymentService = {
  createOrder: async (data) => {
    const res = await api.post('/payments/create-order', data);
    return res.data;
  },
  verifyPayment: async (data) => {
    const res = await api.post('/payments/verify', data);
    return res.data;
  },
};
