<div align="center">

# 🛡️ SENTINEL — Automated Application Security

**Plataforma DAST (Dynamic Application Security Testing) que deteta vulnerabilidades web automaticamente.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-dast--tool.vercel.app-00d97e?style=for-the-badge&logo=vercel&logoColor=white)](https://dast-tool.vercel.app)
[![API Status](https://img.shields.io/badge/API_Status-Online-success?style=for-the-badge&logo=render&logoColor=white)](https://dast-tool-backend.onrender.com/health)

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
- [Funcionalidades](#-funcionalidades)
- [Stack Tecnológica](#-stack-tecnológica)
- [Módulos de Deteção](#-módulos-de-deteção)
- [Como Correr Localmente](#-como-correr-localmente)
- [Segurança e Boas Práticas](#-segurança-e-boas-práticas)
- [Licença](#-licença)

---

## 🎯 Sobre o Projeto

O **Sentinel** foi desenhado para colmatar a lacuna entre ferramentas de segurança complexas e as necessidades reais de developers e equipas de DevSecOps. 

Em vez de esperar por uma auditoria manual demorada, o Sentinel permite-te fazer um scan completo em menos de 15 minutos, gerando relatórios acionáveis em PDF e CSV.

> **⚠️ Aviso Legal:** O Sentinel foi construído para ser usado apenas em aplicações para as quais tens **autorização explícita** para testar. Nunca faças scan a sistemas de terceiros sem permissão.

---

## 🏗️ Arquitetura e Deploy

O projeto foi construído com uma arquitetura moderna de **microsserviços serverless**, separando as responsabilidades do frontend, backend e base de dados.

```text
[ Utilizador ] 
      │
      ▼
[ Frontend: React + Vite ] ──(Hospedado na Vercel)
      │
      ▼ (API Calls com JWT)
[ Backend: Flask + Gunicorn ] ──(Hospedado no Render)
      │
      ├──(Scanner Engine: aiohttp/BeautifulSoup)
      │
      ▼
[ Base de Dados: PostgreSQL ] ──(Hospedada no Neon)