import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { usePageMeta } from '@/lib/usePageMeta';
import './terms.css';

const TOC = [
  { id: 'aceitacao', label: '1. Aceitação dos Termos' },
  { id: 'definicoes', label: '2. Definições' },
  { id: 'conta', label: '3. Registo e Conta' },
  { id: 'uso-aceitavel', label: '4. Uso Aceitável' },
  { id: 'servicos', label: '5. Serviços e Limites' },
  { id: 'propriedade', label: '6. Propriedade Intelectual' },
  { id: 'dados', label: '7. Dados e Privacidade' },
  { id: 'seguranca', label: '8. Segurança' },
  { id: 'pagamentos', label: '9. Pagamentos e Renovações' },
  { id: 'garantias', label: '10. Isenção de Garantias' },
  { id: 'responsabilidade', label: '11. Limitação de Responsabilidade' },
  { id: 'indemnizacao', label: '12. Indemnização' },
  { id: 'suspensao', label: '13. Suspensão e Rescisão' },
  { id: 'alteracoes', label: '14. Alterações aos Termos' },
  { id: 'lei', label: '15. Lei Aplicável e Foro' },
  { id: 'contacto', label: '16. Contacto' },
];

export default function Terms() {
  usePageMeta();

  return (
    <LegalLayout
      title="Termos e Condições"
      subtitle="As regras que regem a utilização da plataforma Sentinel, os serviços associados e as responsabilidades de ambas as partes."
      version="1.0.0"
      lastUpdated="20 de outubro de 2026"
      effectiveDate="20 de outubro de 2026"
      toc={TOC}
      breadcrumb="Termos"
    >
      <div className="legal-callout legal-callout-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div>
          <strong>Resumo em linguagem simples:</strong> podes usar o Sentinel
          para testar aplicações que <em>tens autorização para analisar</em>.
          Não fazemos uso indevido dos teus dados. Podes terminar a conta a
          qualquer momento.
        </div>
      </div>

      <p className="legal-lead">
        Estes Termos e Condições ("<strong>Termos</strong>") constituem um
        acordo legal vinculativo entre <strong>ti</strong> ("<strong>Utilizador</strong>")
        e o <strong>Sentinel</strong> ("nós", "nosso"), relativamente ao acesso
        e utilização da plataforma Sentinel.
      </p>

      <h2 id="aceitacao">1. Aceitação dos Termos</h2>
      <p>
        1.1. Ao utilizar o Serviço, confirmas que tens, pelo menos, 16 anos de
        idade e capacidade legal para celebrar contratos vinculativos.
      </p>
      <p>
        1.2. Se utilizares o Serviço em nome de uma organização, declaras ter
        autoridade para vincular essa organização a estes Termos.
      </p>

      <h2 id="definicoes">2. Definições</h2>
      <ul className="legal-list">
        <li><strong>"Serviço"</strong> — plataforma Sentinel, incluindo scanners, relatórios, API, CLI e dashboards.</li>
        <li><strong>"Alvo"</strong> — aplicação, API, domínio ou infraestrutura submetida para análise.</li>
        <li><strong>"Resultado"</strong> — relatório, findings, evidências e pontuações gerados pelo Serviço.</li>
        <li><strong>"Credenciais"</strong> — email, palavra-passe, tokens de API ou outros elementos de autenticação.</li>
      </ul>

      <h2 id="conta">3. Registo e Conta</h2>
      <p>
        3.1. Comprometes-te a fornecer informação verdadeira e a manter a
        confidencialidade das tuas Credenciais.
      </p>
      <p>
        3.2. Deves notificar-nos imediatamente em{" "}
        <a href="mailto:security@sentinel.sec">security@sentinel.sec</a> caso
        suspeites de acesso não autorizado.
      </p>

      <h2 id="uso-aceitavel">4. Uso Aceitável</h2>
      <p>
        4.1. <strong>Só podes submeter Alvos para os quais tenhas autorização
        expressa e documentada</strong> do respetivo proprietário.
      </p>
      <p>4.2. Comprometes-te a <strong>não</strong> utilizar o Serviço para:</p>
      <ul className="legal-list">
        <li>Testar alvos sem autorização por escrito do proprietário;</li>
        <li>Realizar ataques de negação de serviço (DoS/DDoS);</li>
        <li>Explorar vulnerabilidades além do necessário para as reportar;</li>
        <li>Exfiltrar dados, mesmo que encontrados por acidente.</li>
      </ul>

      <h2 id="servicos">5. Serviços e Limites</h2>
      <p>
        5.1. O Serviço é fornecido nos termos do plano contratado. Limites de
        utilização estão descritos na página de preços.
      </p>
      <p>
        5.2. Reservamo-nos o direito de efetuar manutenção programada com
        antecedência mínima de 24 horas.
      </p>

      <h2 id="propriedade">6. Propriedade Intelectual</h2>
      <p>
        6.1. O Serviço, o seu código-fonte, design e documentação são
        propriedade do Sentinel ou dos seus licenciantes.
      </p>
      <p>
        6.2. O código open-source do Sentinel é disponibilizado sob a licença
        MIT, nos termos definidos no repositório oficial.
      </p>

      <h2 id="dados">7. Dados e Privacidade</h2>
      <p>
        7.1. O tratamento de dados pessoais é regido pela nossa{" "}
        <Link to="/privacy">Política de Privacidade</Link>.
      </p>
      <p>
        7.2. Os Resultados de scans são armazenados de forma cifrada e ficam
        acessíveis apenas ao Utilizador e às pessoas por ele autorizadas.
      </p>

      <h2 id="seguranca">8. Segurança</h2>
      <p>
        8.1. Implementamos medidas técnicas e organizativas adequadas para
        proteger os dados contra acesso não autorizado.
      </p>
      <p>
        8.2. Vulnerabilidades no próprio Serviço devem ser reportadas para{" "}
        <a href="mailto:security@sentinel.sec">security@sentinel.sec</a>.
      </p>

      <h2 id="pagamentos">9. Pagamentos e Renovações</h2>
      <p>
        9.1. Planos pagos são cobrados antecipadamente, no início de cada ciclo.
      </p>
      <p>
        9.2. As subscrições renovam automaticamente, salvo cancelamento antes
        do final do ciclo em curso.
      </p>

      <h2 id="garantias">10. Isenção de Garantias</h2>
      <p className="legal-emphasis">
        O Serviço é fornecido "<strong>tal como está</strong>" e "
        <strong>conforme disponível</strong>", sem garantias de qualquer tipo.
      </p>
      <p>
        Não garantimos que o Serviço detete <strong>todas</strong> as
        vulnerabilidades de um Alvo.
      </p>

      <h2 id="responsabilidade">11. Limitação de Responsabilidade</h2>
      <p>
        11.1. Na máxima extensão permitida por lei, o Sentinel não será
        responsável por danos indiretos, incidentais, especiais ou
        consequenciais.
      </p>

      <h2 id="indemnizacao">12. Indemnização</h2>
      <p>
        O Utilizador concorda em indemnizar o Sentinel por qualquer reclamação
        resultante de violação destes Termos.
      </p>

      <h2 id="suspensao">13. Suspensão e Rescisão</h2>
      <p>
        13.1. O Utilizador pode terminar a conta a qualquer momento.
      </p>
      <p>
        13.2. O Sentinel pode suspender o acesso em caso de violação destes
        Termos.
      </p>

      <h2 id="alteracoes">14. Alterações aos Termos</h2>
      <p>
        14.1. Alterações materiais serão comunicadas com pelo menos 15 dias
        de antecedência.
      </p>

      <h2 id="lei">15. Lei Aplicável e Foro</h2>
      <p>
        15.1. Estes Termos regem-se pelas leis de <strong>Portugal</strong>.
      </p>
      <p>
        15.2. Qualquer litígio será submetido aos tribunais da comarca de{" "}
        <strong>Lisboa</strong>.
      </p>

      <h2 id="contacto">16. Contacto</h2>
      <ul className="legal-list legal-list-clean">
        <li><strong>Geral:</strong> <a href="mailto:legal@sentinel.sec">legal@sentinel.sec</a></li>
        <li><strong>Suporte:</strong> <a href="mailto:support@sentinel.sec">support@sentinel.sec</a></li>
        <li><strong>Segurança:</strong> <a href="mailto:security@sentinel.sec">security@sentinel.sec</a></li>
        <li><strong>DPO:</strong> <a href="mailto:dpo@sentinel.sec">dpo@sentinel.sec</a></li>
      </ul>

      <div className="legal-callout legal-callout-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <strong>Aviso importante:</strong> A utilização do Sentinel para
          testar sistemas sem autorização prévia e documentada pode ser
          considerada crime informático.
        </div>
      </div>

      <p className="legal-end">
        Ao continuar a utilizar o Serviço, confirmas que leste e concordas com
        estes Termos e Condições.
      </p>
    </LegalLayout>
  );
}