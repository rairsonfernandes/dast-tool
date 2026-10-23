import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { usePageMeta } from '@/lib/usePageMeta';
import './privacy.css';

const TOC = [
  { id: 'resumo', label: '0. Resumo' },
  { id: 'responsavel', label: '1. Responsável' },
  { id: 'dados-recolhidos', label: '2. Dados Recolhidos' },
  { id: 'finalidades', label: '3. Finalidades' },
  { id: 'cookies', label: '4. Cookies' },
  { id: 'partilha', label: '5. Partilha' },
  { id: 'transferencias', label: '6. Transferências' },
  { id: 'retencao', label: '7. Retenção' },
  { id: 'seguranca', label: '8. Segurança' },
  { id: 'direitos', label: '9. Direitos' },
  { id: 'menores', label: '10. Menores' },
  { id: 'marketing', label: '11. Marketing' },
  { id: 'alteracoes', label: '12. Alterações' },
  { id: 'reclamacoes', label: '13. Reclamações' },
];

export default function Privacy() {
  usePageMeta();

  return (
    <LegalLayout
      title="Política de Privacidade"
      subtitle="Como recolhemos, utilizamos, armazenamos e protegemos os teus dados pessoais, em conformidade com o RGPD."
      version="1.0.0"
      lastUpdated="20 de outubro de 2026"
      effectiveDate="20 de outubro de 2026"
      toc={TOC}
      breadcrumb="Privacidade"
    >
      <h2 id="resumo">0. Resumo em Linguagem Simples</h2>
      <div className="legal-callout legal-callout-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div>
          <strong>Em 60 segundos:</strong>
          <ul className="legal-list legal-list-clean" style={{ marginTop: 10 }}>
            <li>Recolhemos apenas os dados necessários.</li>
            <li>Não vendemos os teus dados.</li>
            <li>Os resultados dos scans são teus e ficam cifrados.</li>
            <li>Podes exportar ou eliminar a conta a qualquer momento.</li>
          </ul>
        </div>
      </div>

      <h2 id="responsavel">1. Responsável pelo Tratamento</h2>
      <ul className="legal-list legal-list-clean">
        <li><strong>Entidade:</strong> Sentinel Technologies, Lda.</li>
        <li><strong>Sede:</strong> Lisboa, Portugal</li>
        <li><strong>DPO:</strong> <a href="mailto:raynfernandes214@gmail.com">raynfernandes214@gmail.com</a></li>
        <li><strong>Autoridade de controlo:</strong> CNPD</li>
      </ul>

      <h2 id="dados-recolhidos">2. Que Dados Recolhemos</h2>
      <h3>2.1. Dados fornecidos diretamente</h3>
      <ul className="legal-list">
        <li>Dados de conta (nome, email, password cifrada)</li>
        <li>Dados de faturação (nome fiscal, NIF)</li>
        <li>Conteúdo do Utilizador (URLs, notas)</li>
      </ul>
      <h3>2.2. Dados recolhidos automaticamente</h3>
      <ul className="legal-list">
        <li>Dados técnicos (IP, user agent, browser)</li>
        <li>Dados de utilização (páginas, funcionalidades)</li>
        <li>Logs de segurança</li>
      </ul>

      <h2 id="finalidades">3. Finalidades e Bases Legais</h2>
      <table className="legal-table">
        <thead>
          <tr><th>Finalidade</th><th>Base Legal</th></tr>
        </thead>
        <tbody>
          <tr><td>Criar e gerir a conta</td><td>Execução de contrato</td></tr>
          <tr><td>Fornecer os serviços</td><td>Execução de contrato</td></tr>
          <tr><td>Faturar</td><td>Obrigação legal</td></tr>
          <tr><td>Prevenir fraude</td><td>Interesse legítimo</td></tr>
        </tbody>
      </table>

      <h2 id="cookies">4. Cookies</h2>
      <p>
        Utilizamos cookies essenciais (autenticação) e funcionais (preferências).
        Não usamos cookies de marketing.
      </p>

      <h2 id="partilha">5. Partilha com Terceiros</h2>
      <p><strong>Não vendemos os teus dados pessoais.</strong> Partilhamos apenas com subcontratantes:</p>
      <table className="legal-table">
        <thead>
          <tr><th>Subcontratante</th><th>Finalidade</th></tr>
        </thead>
        <tbody>
          <tr><td>AWS / Google Cloud</td><td>Infraestrutura</td></tr>
          <tr><td>Stripe / Paddle</td><td>Pagamentos</td></tr>
          <tr><td>Postmark / Resend</td><td>Emails transacionais</td></tr>
        </tbody>
      </table>

      <h2 id="transferencias">6. Transferências Internacionais</h2>
      <p>
        Os dados são maioritariamente tratados no EEE. Quando recorremos a
        prestadores fora do EEE, garantimos salvaguardas adequadas (SCC).
      </p>

      <h2 id="retencao">7. Prazos de Retenção</h2>
      <table className="legal-table">
        <thead>
          <tr><th>Tipo de dados</th><th>Retenção</th></tr>
        </thead>
        <tbody>
          <tr><td>Conta ativa</td><td>Enquanto a conta existir</td></tr>
          <tr><td>Resultados de scans</td><td>12-24 meses</td></tr>
          <tr><td>Dados de faturação</td><td>10 anos (obrigação fiscal)</td></tr>
          <tr><td>Logs de segurança</td><td>90 dias</td></tr>
        </tbody>
      </table>

      <h2 id="seguranca">8. Segurança dos Dados</h2>
      <ul className="legal-list">
        <li>TLS 1.3 em trânsito</li>
        <li>AES-256 em repouso</li>
        <li>Argon2id para passwords</li>
        <li>2FA disponível</li>
      </ul>

      <h2 id="direitos">9. Os Teus Direitos (RGPD)</h2>
      <ul className="legal-list">
        <li><strong>Acesso</strong> (art. 15.º)</li>
        <li><strong>Retificação</strong> (art. 16.º)</li>
        <li><strong>Apagamento</strong> (art. 17.º)</li>
        <li><strong>Limitação</strong> (art. 18.º)</li>
        <li><strong>Portabilidade</strong> (art. 20.º)</li>
        <li><strong>Oposição</strong> (art. 21.º)</li>
      </ul>
      <p>
        Podes exercer em <a href="mailto:raynfernandes214@gmail.com">raynfernandes214@gmail.com</a>.
        Resposta em 30 dias.
      </p>

      <h2 id="menores">10. Menores de Idade</h2>
      <p>
        O Serviço não se destina a menores de 16 anos. Não recolhemos dados de
        menores intencionalmente.
      </p>

      <h2 id="marketing">11. Comunicações de Marketing</h2>
      <p>
        Só enviamos marketing com consentimento expresso. Podes cancelar em
        qualquer momento. Emails transacionais não são marketing.
      </p>

      <h2 id="alteracoes">12. Alterações a Esta Política</h2>
      <p>
        Alterações materiais serão comunicadas com 15 dias de antecedência.
      </p>

      <h2 id="reclamacoes">13. Reclamações e Contacto</h2>
      <p>
        Podes reclamar à CNPD — Comissão Nacional de Proteção de Dados:
      </p>
      <ul className="legal-list legal-list-clean">
        <li>Av. D. Carlos I, 134, 1.º — 1200-651 Lisboa</li>
        <li><a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">www.cnpd.pt</a></li>
      </ul>

      <p>Contactos:</p>
      <ul className="legal-list legal-list-clean">
        <li><strong>DPO:</strong> <a href="mailto:raynfernandes214@gmail.com">raynfernandes214@gmail.com</a></li>
        <li><strong>Privacidade:</strong> <a href="mailto:raynfernandes214@gmail.com">raynfernandes214@gmail.com</a></li>
        <li><strong>Segurança:</strong> <a href="mailto:raynfernandes214@gmail.com">raynfernandes214@gmail.com</a></li>
      </ul>

      <p className="legal-end">
        Esta Política é parte integrante dos nossos{" "}
        <Link to="/terms">Termos e Condições</Link>.
      </p>
    </LegalLayout>
  );
}