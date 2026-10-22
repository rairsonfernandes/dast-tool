# SENTINEL — Automated Application Security

Plataforma DAST (Dynamic Application Security Testing) que deteta vulnerabilidades web automaticamente.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-green)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)

## 🚀 Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Python 3.12, Flask, SQLAlchemy, Gunicorn
- **DB:** PostgreSQL (Neon)
- **Scanner:** aiohttp, BeautifulSoup4, 13 módulos de deteção

## 🛡️ Funcionalidades

- [x] 13 módulos: SQLi, XSS, LFI, SSRF, Headers, TLS, CORS, etc.
- [x] Scans assíncronos com workers em background
- [x] Autenticação JWT (SUPER_ADMIN, ADMIN, ANALYST, VIEWER)
- [x] Relatórios PDF/CSV reais
- [x] Suporte a scans autenticados (cookies/headers)
- [x] Admin Console

## ⚙️ Correr localmente

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
flask db upgrade
python run_dev.py