import dotenv from 'dotenv';

dotenv.config();

export const llmConfig = {
  base_url: process.env.LLM_BASE_URL || 'http://localhost:8000',
  api_key: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
  max_tokens: 2000
};

export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-jwt-secret-key',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
};

export const serverConfig = {
  port: parseInt(process.env.PORT || '3000'),
  env: process.env.NODE_ENV || 'development'
};
