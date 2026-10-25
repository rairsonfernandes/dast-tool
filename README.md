<div align="center">

# 🛡️ SENTINEL — Automated Application Security

**Plataforma DAST (Dynamic Application Security Testing) enterprise-grade para verificação automatizada de vulnerabilidades web.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-dast--tool.vercel.app-00d97e?style=for-the-badge&logo=vercel&logoColor=white)](https://dast-tool.vercel.app)
[![API Status](https://img.shields.io/badge/API_Status-Online-success?style=for-the-badge&logo=render&logoColor=white)](https://dast-tool-backend.onrender.com/health)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

<br>

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)

</div>

---

## 📖 Índice

- [Sobre o Projeto](#-sobre-o-projeto)
- [Arquitetura e Deploy](#-arquitetura-e-deploy)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Stack Tecnológica](#-stack-tecnológica)
- [Módulos de Deteção](#-módulos-de-deteção)
- [Como Executar Localmente](#-como-executar-localmente)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Segurança e Boas Práticas](#-segurança-e-boas-práticas)
- [Licença e Aviso Legal](#-licença-e-aviso-legal)

---

## 🎯 Sobre o Projeto

O **Sentinel** é uma solução de **Dynamic Application Security Testing (DAST)** desenvolvida para integrar a segurança diretamente no fluxo de desenvolvimento (DevSecOps). A plataforma analisa aplicações em execução para identificar falhas de segurança conhecidas sem necessidade de acesso ao código-fonte.

### Principais Benefícios
- **Agilidade:** Scans completos executados em menos de 15 minutos.
- **Relatórios Prontos para Executivos e Devs:** Exportação de resultados em formatos PDF e CSV com remediações recomendadas.
- **Fácil Integração:** Arquitetura pensada para pipelines CI/CD modernos.

> **⚠️ Aviso de Responsabilidade:** O Sentinel destina-se exclusivamente a ser utilizado em sistemas nos quais possui **autorização prévia e expressa** para a realização de testes de segurança.

---

## 🏗️ Arquitetura e Deploy

A plataforma utiliza uma arquitetura descentralizada de microsserviços, garantindo escalabilidade e isolamento entre a interface de utilizador, o motor de scanning e a persistência de dados.

```text
┌──────────────────────────────────────────────────────────┐
│                   Utilizador / Navegador                 │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│           Frontend: React + TypeScript + Vite             │
│                   (Hospedado na Vercel)                  │
└────────────────────────────┬─────────────────────────────┘
                             │
                             │ (Requisições HTTP com JWT)
                             ▼
┌──────────────────────────────────────────────────────────┐
│           Backend API: Flask + Gunicorn                  │
│                   (Hospedado no Render)                  │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │   Motor DAST (Asynchronous Engine: aiohttp)      │   │
│   └──────────────────────────────────────────────────┘   │
└──────────────┬────────────────────────────┬──────────────┘
               │                            │
               ▼                            ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ Base de Dados PostgreSQL │    │ Targets (Aplicações Web  │
│    (Hospedado no Neon)   │    │     sob Teste Autorizado)│
└──────────────────────────┘    └──────────────────────────┘
```

---

## ✨ Funcionalidades Principais

- 🔍 **Scans Personalizáveis:** Escolha entre varreduras rápidas (Quick Scan) ou profundas (Full Scan).
- 📊 **Dashboard Integrado:** Visualização clara do nível de risco global (Crítico, Alto, Médio, Baixo).
- 📑 **Exportação de Relatórios:** Relatórios detalhados em PDF (para gestão) e CSV (para análise de dados).
- 🔐 **Autenticação Segura:** Controlo de acessos baseado em tokens JWT com refresh automático.
- ⚡ **Execução Assíncrona:** Utilização de I/O não-bloqueante para varreduras de alta performance.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Utilização |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Tailwind CSS | Interface de utilizador responsiva e interativa |
| **Backend** | Python 3.12, Flask, Gunicorn | API RESTful e orquestração de testes |
| **Engine DAST** | `aiohttp`, `BeautifulSoup4` | Requisições assíncronas e análise estrutural DOM |
| **Base de Dados** | PostgreSQL 16 (Neon Serverless) | Persistência de utilizadores, histórico e relatórios |
| **DevOps & Infra** | Docker, Vercel, Render | Containerização e alojamento contínuo (CI/CD) |

---

## 🛡️ Módulos de Deteção

O Sentinel inclui verificação automatizada para diversas categorias do **OWASP Top 10**:

- **Injection Flaws:** SQL Injection (SQLi) baseado em erro e tempo.
- **Cross-Site Scripting (XSS):** Refletido e armazenado em formulários/parâmetros URL.
- **Security Misconfigurations:**
  - Ausência de cabeçalhos HTTP de segurança (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`).
  - Ficheiros sensíveis expostos (`.git/`, `.env`, `backup.sql`, `phpinfo.php`).
  - Certificados SSL/TLS expirados ou fracos.
- **Cross-Site Request Forgery (CSRF):** Validação de tokens de proteção em formulários estáticos e dinâmicos.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Docker** & **Docker Compose** instalados (Recomendado)
- Ou localmente: **Python 3.12+**, **Node.js 18+** e **PostgreSQL**.

### Opção 1: Utilizando Docker Compose (Mais Rápido)

```bash
# 1. Clonar o repositório
git clone https://github.com/teu-usuario/sentinel.git
cd sentinel

# 2. Configurar as variáveis de ambiente (copiar exemplos)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Iniciar os containers
docker-compose up -d --build
```

A aplicação estará acessível em:
- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://localhost:5000`

---

### Opção 2: Instalação Manual

#### 1. Backend (Flask API)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # No Windows: venv\Scripts\activate
pip install -r requirements.txt
flask db upgrade
python app.py
```

#### 2. Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

---

## 🔑 Variáveis de Ambiente

Cria os ficheiros `.env` nos respetivos diretórios com a seguinte estrutura:

### `backend/.env`
```env
FLASK_ENV=development
SECRET_KEY=sua_chave_secreta_super_segura
DATABASE_URL=postgresql://usuario:senha@localhost:5432/sentinel_db
JWT_SECRET_KEY=sua_jwt_chave_secreta
CORS_ORIGINS=http://localhost:5173
```

### `frontend/.env`
```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

---

## 🔐 Segurança e Boas Práticas

- **Não Persistência de Dados Sensíveis:** O Sentinel não guarda credenciais capturadas durante a análise de endpoints.
- **Rate Limiting:** O motor possui limitadores de requisições configuráveis para evitar ataques acidentais de Negação de Serviço (DoS) aos alvos.
- **Encriptação:** Palavras-passe são armazenadas utilizando algoritmos de hashing forte (`bcrypt`).

---

## 📄 Licença e Aviso Legal

Este projeto está licenciado sob a Licença MIT - consulta o ficheiro [LICENSE](LICENSE) para mais detalhes.

**Aviso Legal:** *O desenvolvimento desta ferramenta tem fins estritamente educacionais e de defesa. O uso indevido contra alvos não autorizados constitui atividade ilegal segundo a legislação de crimes informáticos.*


