import { Link } from "react-router-dom";
import { GithubIcon, LinkedinIcon, MailIcon } from "@/components/LandingIcons";

export function Footer() {
  return (
    <footer className="footer-premium">
      <div className="footer-premium-inner">
        <p className="footer-premium-copy">
          © {new Date().getFullYear()} Sentinel · Open source · MIT License
        </p>

        <nav className="footer-premium-nav" aria-label="Links legais">
          <Link to="/terms">Termos</Link>
          <Link to="/privacy">Privacidade</Link>
        </nav>

        <div className="footer-premium-socials">
          <a
            href="https://github.com/rairsonfernandes/dast-tool"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <GithubIcon size={20} />
          </a>
          <a
            href="https://www.linkedin.com/in/rairsonfernandes"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <LinkedinIcon size={20} />
          </a>
          <a href="mailto:raynfernande214@gmail.com" aria-label="Email">
            <MailIcon size={20} />
          </a>
        </div>
      </div>
    </footer>
  );
}