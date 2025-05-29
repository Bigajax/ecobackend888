import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import openrouterRoutes from './routes/openrouterRoutes';
import promptRoutes from './routes/promptRoutes';
import memoryRoutes from './routes/memoryRoutes';
import profileRoutes from './routes/profileRoutes';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`Backend: [${req.method}] ${req.originalUrl}`);
  next();
});

// Registrar rotas
app.use('/api', openrouterRoutes);
app.use('/api', promptRoutes);
app.use('/api', memoryRoutes);
app.use('/api/profiles', profileRoutes); // cuidado: a rota espera /api/profiles/:userId

app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;
