import {
  Code, Database, Server, FileText, Globe, GitBranch,
  Lock, Shield, Wifi, Bug, AlertTriangle, Key, Zap,
  ExternalLink, ArrowUpRight,
} from "lucide-react";

// ============================================
// TIPOS
// ============================================
interface CapabilityItem {
  icon: React.ElementType;
  name: string;
  desc: string;
  docs: { label: string; href: string }[];
}

// ============================================
// DOCUMENTAÇÃO PÚBLICA POR VULNERABILIDADE
// ============================================
const ITEMS: CapabilityItem[] = [
  {
    icon: Code,
    name: "XSS refletido",
    desc: "GET e POST",
    docs: [
      { label: "OWASP XSS Prevention", href: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html" },
      { label: "PortSwigger XSS", href: "https://portswigger.net/web-security/cross-site-scripting" },
    ],
  },
  {
    icon: Database,
    name: "SQL Injection",
    desc: "Error + boolean",
    docs: [
      { label: "OWASP SQLi Prevention", href: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html" },
      { label: "PortSwigger SQLi", href: "https://portswigger.net/web-security/sql-injection" },
    ],
  },
  {
    icon: Server,
    name: "SSRF",
    desc: "Com baseline",
    docs: [
      { label: "PortSwigger SSRF", href: "https://portswigger.net/web-security/ssrf" },
      { label: "OWASP WSTG SSRF", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/19-Testing_for_Server-Side_Request_Forgery" },
    ],
  },
  {
    icon: FileText,
    name: "LFI / Path Traversal",
    desc: "Inclusão de ficheiros",
    docs: [
      { label: "PortSwigger Path Traversal", href: "https://portswigger.net/web-security/file-path-traversal" },
      { label: "OWASP WSTG LFI", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/11.1-Testing_for_Local_File_Inclusion" },
    ],
  },
  {
    icon: Globe,
    name: "Open Redirect",
    desc: "Redirecionamentos",
    docs: [
      { label: "OWASP WSTG Open Redirect", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/04-Testing_for_Open_Redirection" },
      { label: "CWE-601", href: "https://cwe.mitre.org/data/definitions/601.html" },
    ],
  },
  {
    icon: GitBranch,
    name: "Command Injection",
    desc: "Time-based",
    docs: [
      { label: "PortSwigger OS Command Injection", href: "https://portswigger.net/web-security/os-command-injection" },
      { label: "OWASP WSTG Command Injection", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/12-Testing_for_Command_Injection" },
    ],
  },
  {
    icon: Lock,
    name: "CORS",
    desc: "Misconfiguration",
    docs: [
      { label: "PortSwigger CORS", href: "https://portswigger.net/web-security/cors" },
      { label: "OWASP WSTG CORS", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing" },
    ],
  },
  {
    icon: Shield,
    name: "Security Headers",
    desc: "6 headers em falta",
    docs: [
      { label: "OWASP Secure Headers", href: "https://owasp.org/www-project-secure-headers/" },
      { label: "MDN HTTP Headers", href: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers" },
    ],
  },
  {
    icon: Wifi,
    name: "TLS / SSL",
    desc: "Configurações fracas",
    docs: [
      { label: "OWASP TLS Cheat Sheet", href: "https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html" },
      { label: "SSL Labs", href: "https://www.ssllabs.com/ssltest/" },
    ],
  },
  {
    icon: Bug,
    name: "Exposed Files",
    desc: ".env, .git, Dockerfile",
    docs: [
      { label: "OWASP WSTG Information Disclosure", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/05-Review_Webpage_Content_for_Information_Leakage" },
      { label: "CWE-538", href: "https://cwe.mitre.org/data/definitions/538.html" },
    ],
  },
  {
    icon: AlertTriangle,
    name: "Directory Listing",
    desc: "Diretórios expostos",
    docs: [
      { label: "OWASP WSTG Directory Listing", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information" },
      { label: "CWE-548", href: "https://cwe.mitre.org/data/definitions/548.html" },
    ],
  },
  {
    icon: Key,
    name: "Subdomain Takeover",
    desc: "DNS misconfig",
    docs: [
      { label: "OWASP WSTG Subdomain Takeover", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/10-Test_for_Subdomain_Takeover" },
      { label: "HackerOne Guide", href: "https://docs.hackerone.com/en/articles/8473931-subdomain-takeover" },
    ],
  },
  {
    icon: Zap,
    name: "Crawler + Recon",
    desc: "Descoberta automática",
    docs: [
      { label: "OWASP WSTG Recon", href: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/" },
      { label: "PortSwigger Recon", href: "https://portswigger.net/web-security/information-disclosure" },
    ],
  },
];

// ============================================
// COMPONENTE
// ============================================
export function Capabilities() {
  return (
    <section
      className="py-24 px-6 border-t"
      style={{
        backgroundColor: "#0B1220",
        borderColor: "rgba(241, 245, 249, 0.08)",
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="max-w-2xl mb-12">
          <p
            className="text-xs font-mono uppercase tracking-wider mb-3"
            style={{ color: "#16C7B7" }}
          >
            Cobertura
          </p>
          <h2
            className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
            style={{ color: "#F1F5F9" }}
          >
            13 módulos. Cobertura completa do{" "}
            <span style={{ color: "#16C7B7" }}>OWASP Top 10</span>.
          </h2>
          <p
            className="leading-relaxed"
            style={{ color: "rgba(241, 245, 249, 0.55)" }}
          >
            Cada módulo testa um vetor específico com payloads reais e validação de
            contexto. O crawler descobre URLs, parâmetros e formulários
            automaticamente. Clica em qualquer card para abrir a documentação.
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ITEMS.map(({ icon: Icon, name, desc, docs }) => {
            const primaryDoc = docs[0];
            return (
              <a
                key={name}
                href={primaryDoc.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} — abrir documentação: ${primaryDoc.label}`}
                className="group relative p-4 rounded-lg transition-all duration-200 block cursor-pointer no-underline"
                style={{
                  backgroundColor: "#101A2E",
                  border: "1px solid rgba(241, 245, 249, 0.08)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(22, 199, 183, 0.35)";
                  e.currentTarget.style.backgroundColor = "#16233C";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(241, 245, 249, 0.08)";
                  e.currentTarget.style.backgroundColor = "#101A2E";
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Ícone */}
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      backgroundColor: "rgba(22, 199, 183, 0.10)",
                      border: "1px solid rgba(22, 199, 183, 0.20)",
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ color: "#16C7B7" }} />
                  </div>

                  {/* Conteúdo */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "#F1F5F9" }}
                      >
                        {name}
                      </span>
                      {/* Seta indicando que é clicável */}
                      <ArrowUpRight
                        className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: "#16C7B7" }}
                      />
                    </div>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "rgba(241, 245, 249, 0.55)" }}
                    >
                      {desc}
                    </p>

                    {/* Links de documentação */}
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {docs.map((doc) => (
                        <a
                          key={doc.href}
                          href={doc.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] font-mono transition-colors"
                          style={{ color: "rgba(241, 245, 249, 0.70)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#16C7B7";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color =
                              "rgba(241, 245, 249, 0.70)";
                          }}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          {doc.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Linha decorativa no hover */}
                <div
                  className="absolute bottom-0 left-4 right-4 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, rgba(22, 199, 183, 0.30), transparent)",
                  }}
                />
              </a>
            );
          })}
        </div>

        {/* Footer note */}
        <p
          className="mt-8 text-center text-xs font-mono"
          style={{ color: "rgba(241, 245, 249, 0.40)" }}
        >
          Documentação oficial OWASP, PortSwigger e CWE · Links abrem em nova aba
        </p>
      </div>
    </section>
  );
}