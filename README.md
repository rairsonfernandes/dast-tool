# SENTINEL — Automated Application Security

Plataforma de segurança de aplicações web com deteção automatizada de vulnerabilidades OWASP Top 10.

![Sentinel Banner](https://via.placeholder.com/1200x400/0a0b0f/00d97e?text=SENTINEL)

## 🚀 Stack Tecnológica

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS (Hospedado na Vercel)
- **Backend:** Python 3.12, Flask, SQLAlchemy, Gunicorn (Hospedado no Koyeb)
- **Base de Dados:** PostgreSQL (Hospedada no Neon)
- **Scanner:** aiohttp, BeautifulSoup4, threading (13 módulos de deteção)

## 🛡️ Funcionalidades

- [x] Dashboard com métricas em tempo real
- [x] Scans assíncronos (SQLi, XSS, LFI, Headers, TLS, etc.)
- [x] Autenticação JWT (Role-based: Admin, Analyst, Viewer)
- [x] Gestão de vulnerabilidades e relatórios PDF/CSV
- [x] Suporte a scans autenticados (cookies/headers)
- [x] Admin Console (gestão de utilizadores e sistema)

## ⚙️ Como correr localmente

### 1. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Preenche as variáveis
flask db upgrade          # Aplica migrações
python run_dev.py         # Arranca Flask + Metrics Agent