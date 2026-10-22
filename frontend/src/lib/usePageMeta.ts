// ============================================================
// SENTINEL — usePageMeta
// Sincroniza <title>, meta description, OG, Twitter, canonical,
// robots e JSON-LD com a rota atual.
// ============================================================

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'Sentinel';
const BASE_URL = 'https://sentinel.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const DEFAULT_TITLE = `${SITE_NAME} — Automated Application Security`;
const DEFAULT_DESCRIPTION =
  'Deteta vulnerabilidades web automaticamente. OWASP Top 10 coberto. 13 módulos de deteção, relatórios acionáveis, scans em minutos.';

interface PageMeta {
  title: string;
  description?: string;
  keywords?: string;
  robots?: string;
  type?: string;
  image?: string;
  jsonLd?: Record<string, unknown>;
}

const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: `${SITE_NAME} — Segurança de aplicações automatizada`,
    description:
      'Plataforma de segurança de aplicações web com deteção automatizada de vulnerabilidades OWASP Top 10, relatórios acionáveis e integração CI/CD.',
    keywords:
      'segurança web, pentest automático, OWASP Top 10, DAST, vulnerabilidades, scan de segurança, cibersegurança, SENTINEL',
    robots: 'index, follow, max-image-preview:large',
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Sentinel',
      applicationCategory: 'SecurityApplication',
      operatingSystem: 'Web',
      url: BASE_URL,
      description:
        'Plataforma de segurança de aplicações web com deteção automatizada de vulnerabilidades OWASP Top 10.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      creator: { '@type': 'Organization', name: SITE_NAME, url: BASE_URL },
    },
  },

  '/login': {
    title: `Entrar —— ${SITE_NAME}`,
    description: 'Entra na tua conta Sentinel para aceder ao dashboard de segurança.',
    robots: 'noindex, nofollow',
  },

  '/register': {
    title: `Criar conta —— ${SITE_NAME}`,
    description: 'Cria a tua conta gratuita Sentinel e começa a analisar as tuas aplicações em minutos.',
    robots: 'noindex, nofollow',
  },

  '/forgot-password': {
    title: `Recuperar password —— ${SITE_NAME}`,
    description: 'Recupera o acesso à tua conta Sentinel.',
    robots: 'noindex, nofollow',
  },

  '/reset-password': {
    title: `Nova password —— ${SITE_NAME}`,
    description: 'Define uma nova password para a tua conta Sentinel.',
    robots: 'noindex, nofollow',
  },

  '/terms': {
    title: `Termos e Condições —— ${SITE_NAME}`,
    description:
      'Termos e condições de utilização da plataforma Sentinel, incluindo regras de uso aceitável e limitações de responsabilidade.',
    robots: 'index, follow',
    type: 'article',
  },

  '/privacy': {
    title: `Política de Privacidade —— ${SITE_NAME}`,
    description:
      'Como o Sentinel recolhe, utiliza e protege dados pessoais, em conformidade com o RGPD.',
    robots: 'index, follow',
    type: 'article',
  },

  '/dashboard': {
    title: `Dashboard —— ${SITE_NAME}`,
    description: 'Visão geral de segurança e ameaças.',
    robots: 'noindex, nofollow',
  },

  '/scans': {
    title: `Scans  —— ${SITE_NAME}`,
    description: 'Gestão de varreduras de segurança.',
    robots: 'noindex, nofollow',
  },

  '/vulnerabilities': {
    title: `Vulnerabilidades —— ${SITE_NAME}`,
    description: 'Gestão de vulnerabilidades identificadas.',
    robots: 'noindex, nofollow',
  },

  '/reports': {
    title: `Relatórios —— ${SITE_NAME}`,
    description: 'Relatórios técnicos e executivos.',
    robots: 'noindex, nofollow',
  },

  '/settings': {
    title: `Definições —— ${SITE_NAME}`,
    description: 'Definições do sistema.',
    robots: 'noindex, nofollow',
  },

  '/account': {
    title: `Conta —— ${SITE_NAME}`,
    description: 'Perfil do utilizador.',
    robots: 'noindex, nofollow',
  },

  '/admin': {
    title: `Admin Console —— ${SITE_NAME}`,
    description: 'Consola de administração.',
    robots: 'noindex, nofollow',
  },
};

function upsertMeta(
  attr: 'name' | 'property',
  key: string,
  content: string
): HTMLMetaElement {
  let el = document.head.querySelector(
    `meta[${attr}="${key}"]`
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute('data-sentinel-meta', 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

function upsertLink(rel: string, href: string): HTMLLinkElement {
  let el = document.head.querySelector(
    `link[rel="${rel}"]`
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('data-sentinel-meta', 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  return el;
}

function upsertJsonLd(id: string, data: Record<string, unknown>): void {
  const elId = `sentinel-jsonld-${id}`;
  let script = document.getElementById(elId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = elId;
    script.setAttribute('data-sentinel-meta', 'true');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function usePageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta =
      PAGE_META[pathname] ||
      PAGE_META[pathname.replace(/\/[^/]+$/, '')] ||
      {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        robots: 'index, follow',
      };

    const url = `${BASE_URL}${pathname}`;
    const image = meta.image || DEFAULT_IMAGE;
    const description = meta.description || DEFAULT_DESCRIPTION;
    const robots = meta.robots || 'index, follow';
    const type = meta.type || 'website';

    document.title = meta.title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    if (meta.keywords) upsertMeta('name', 'keywords', meta.keywords);

    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:image', image);
    upsertMeta('property', 'og:image:width', '1200');
    upsertMeta('property', 'og:image:height', '630');
    upsertMeta('property', 'og:locale', 'pt_PT');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:site', '@sentinelapp');
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', image);

    upsertLink('canonical', url);

    if (meta.jsonLd) {
      upsertJsonLd('page', meta.jsonLd);
    }

    const pageName =
      pathname === '/'
        ? 'landing'
        : pathname.replace(/^\//, '').split('/')[0] || 'landing';
    document.body.setAttribute('data-page', pageName);
  }, [pathname]);
}