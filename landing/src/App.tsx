import { useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Menu,
  X,
  Terminal,
  Monitor,
  GitBranch,
  Search,
  FileText,
  Folder,
  Link,
  Brain,
  Lock,
  CheckSquare,
} from "lucide-react";

const repo = "https://github.com/hoangtrung1801/know-me";
const install = "npm install -g @hoangtrung1801/knowme";
const slides = [
  {
    name: "Workspace",
    image: "dashboard",
    text: "Your projects, tasks, and knowledge in one local workspace.",
  },
  {
    name: "Kanban",
    image: "kanban",
    text: "Move work forward with a visual board and clear acceptance criteria.",
  },
  {
    name: "Documents",
    image: "docs",
    text: "Keep specifications and project knowledge beside your work.",
  },
  {
    name: "Tasks",
    image: "tasks",
    text: "Give every piece of work a plan, context, and a next step.",
  },
  {
    name: "Graph",
    image: "graph",
    text: "Explore the connections between your documents and tasks.",
  },
  {
    name: "Chat",
    image: "chat",
    text: "Bring your saved project context into the conversation.",
  },
];
const features = [
  {
    title: "Quick capture",
    text: "Keep a thought before you lose it. Save memos from the workspace or CLI.",
    type: "capture",
  },
  {
    title: "Tasks with context",
    text: "Keep the plan, acceptance criteria, and progress together.",
    type: "tasks",
  },
  {
    title: "Projects & references",
    text: "Organize around your work. Connect tasks to the documents that explain them.",
    type: "tags",
  },
  {
    title: "Living documents",
    text: "Specifications, guides, and decisions in readable Markdown.",
    type: "docs",
  },
  {
    title: "One memory, two interfaces",
    text: "A visual workspace for you. Structured CLI and MCP tools for your agents.",
    type: "interfaces",
  },
  {
    title: "Find what matters",
    text: "Retrieve relevant knowledge with keyword and semantic search.",
    type: "search",
  },
  {
    title: "Saved links & memos",
    text: "Collect useful sources and small ideas in your personal workspace.",
    type: "links",
  },
  {
    title: "Git-friendly by design",
    text: "Review project memory alongside your code with familiar Git workflows.",
    type: "git",
  },
  {
    title: "Local-first",
    text: "Readable files on your machine. Your knowledge stays in your hands.",
    type: "local",
  },
];
function FeatureVisual({ type }: { type: string }) {
  if (type === "capture")
    return (
      <div className="keycaps">
        <kbd>knowme</kbd>
        <kbd>memo</kbd>
        <kbd>add</kbd>
      </div>
    );
  if (type === "tasks")
    return (
      <div className="mini-task">
        <span>
          <CheckSquare size={15} /> In progress
        </span>
        <strong>Build something worth keeping</strong>
        <small>Plan · Context · Acceptance criteria</small>
      </div>
    );
  if (type === "tags")
    return (
      <div className="tags">
        <span>
          <Folder size={13} /> My project
        </span>
        <span>
          <FileText size={13} /> Research
        </span>
        <span>@doc/design</span>
        <span>@task/next</span>
      </div>
    );
  if (type === "docs")
    return (
      <div className="mini-doc">
        <strong>Project notes</strong>
        <i />
        <i />
        <i />
        <span>Markdown, made readable.</span>
      </div>
    );
  if (type === "interfaces")
    return (
      <div className="interface-pair">
        <span>
          <Monitor />
          Workspace
        </span>
        <span>
          <Terminal />
          CLI / MCP
        </span>
      </div>
    );
  if (type === "search")
    return (
      <div className="mini-search">
        <span>
          <Search size={16} /> Search your project memory
        </span>
        <small>Tasks · Documents · Decisions</small>
      </div>
    );
  if (type === "links")
    return (
      <div className="saved-link">
        <Link size={20} />
        <div>
          <strong>A little inspiration</strong>
          <small>Saved for your next project</small>
        </div>
      </div>
    );
  if (type === "git")
    return (
      <div className="git-visual">
        <GitBranch size={24} />
        <code>.know-me/</code>
        <span>Markdown + JSON</span>
      </div>
    );
  return (
    <div className="local-visual">
      <Lock size={28} />
      <span>Your machine. Your memory.</span>
    </div>
  );
}
const faqs = [
  [
    "What is KnowMe?",
    "KnowMe is a local-first workspace and memory layer. It brings tasks, documents, project knowledge, saved links, and memos together, with CLI and MCP tools for AI-assisted work.",
  ],
  [
    "Where is my data stored?",
    "Project tasks, documents, decisions, and memories live in your repository’s .know-me directory as Markdown and JSON. Your global workspace, including links and memos, lives in ~/.know-me.",
  ],
  [
    "How do AI agents connect?",
    "Agents can use KnowMe through its Model Context Protocol (MCP) server and CLI. They work with the same project context, tasks, and documents that you use in the web workspace.",
  ],
  [
    "Is KnowMe open source?",
    "Yes. KnowMe is available under the MIT license. Explore the source, installation instructions, and integration guides on GitHub.",
  ],
];
export default function App() {
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState(0);
  const [tour, setTour] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const slide = slides[active];
  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(install);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#" aria-label="KnowMe home">
          <img src="/logo.png" alt="" />
          <span>KnowMe</span>
        </a>
        <nav
          aria-label="Main navigation"
          className={menu ? "navigation is-open" : "navigation"}
        >
          <a href="#features" onClick={() => setMenu(false)}>
            Features
          </a>
          <a href="#tour" onClick={() => setMenu(false)}>
            Product tour
          </a>
          <a href={`${repo}/tree/main/docs/en`}>
            Resources <ArrowUpRight size={12} />
          </a>
          <a href="#faq" onClick={() => setMenu(false)}>
            FAQ
          </a>
        </nav>
        <div className="header-actions">
          <a className="button small" href="#get-started">
            Get KnowMe
          </a>
          <button
            className="menu-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <h1>
            A little context.
            <br className="mobile-break" /> A lasting memory.
          </h1>
          <p>
            Keep tasks, notes, links, and documents in a local workspace.
            <br className="desktop-break" /> Find what you need, and give your
            AI the context to keep going.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#get-started">
              Get started for free <ArrowUpRight size={16} />
            </a>
            <a className="button" href={repo} target="_blank" rel="noreferrer">
              Explore on GitHub
            </a>
          </div>
          <div className="platforms">
            <span>
              <Monitor size={14} /> Local web workspace
            </span>
            <span>
              <GitBranch size={14} /> Open source
            </span>
            <span>
              <Terminal size={14} /> MCP / CLI for AI
            </span>
          </div>
        </section>
        <section
          id="showcase"
          className="showcase content-width"
          aria-label="KnowMe product tour"
        >
          <div className="screenshot-stage">
            <img
              src={`/screenshots/screenshot-${slide.image}.png`}
              alt={`KnowMe ${slide.name.toLowerCase()} interface`}
              width="1996"
              height="1248"
              fetchPriority="high"
            />
            <button
              className="carousel-arrow previous"
              aria-label="Previous feature"
              onClick={() =>
                setActive((active + slides.length - 1) % slides.length)
              }
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="carousel-arrow next"
              aria-label="Next feature"
              onClick={() => setActive((active + 1) % slides.length)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <p className="slide-caption" aria-live="polite">
            <strong>{slide.name}</strong> {slide.text}
          </p>
          <div
            className="thumbnail-tabs"
            role="group"
            aria-label="Product screenshots"
          >
            {slides.map((item, index) => (
              <button
                key={item.name}
                aria-pressed={active === index}
                aria-label={item.name}
                className={active === index ? "selected" : ""}
                onClick={() => setActive(index)}
              >
                <img
                  src={`/screenshots/screenshot-${item.image}.png`}
                  alt=""
                  loading="lazy"
                />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </section>
        <section id="features" className="features content-width">
          <div className="section-heading">
            <h2>
              A workspace that remembers
              <br /> as your work moves forward.
            </h2>
            <p>Fully local. Open source. Built for you and your AI.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature" key={feature.title}>
                <div className="feature-visual" aria-hidden="true">
                  <FeatureVisual type={feature.type} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="tour" className="tour content-width">
          <div className="section-heading">
            <h2>Your work, connected.</h2>
            <p>
              A quick tour through planning, writing, exploring, and asking.
            </p>
          </div>
          <div className="tour-tabs" role="group" aria-label="Workspace views">
            {[1, 2, 4, 5].map((index, pos) => (
              <button
                aria-pressed={tour === pos}
                className={tour === pos ? "active" : ""}
                key={index}
                onClick={() => setTour(pos)}
              >
                {slides[index].name}
              </button>
            ))}
          </div>
          <div className="tour-image">
            <img
              src={`/screenshots/screenshot-${slides[[1, 2, 4, 5][tour]].image}.png`}
              alt={`KnowMe ${slides[[1, 2, 4, 5][tour]].name} view`}
              loading="lazy"
              width="1996"
              height="1248"
            />
          </div>
          <p className="slide-caption" aria-live="polite">
            {slides[[1, 2, 4, 5][tour]].text}
          </p>
        </section>
        <section className="memory-section content-width">
          <div>
            <h2>
              For your mind.
              <br />
              And your next AI session.
            </h2>
            <p>
              Plans, decisions, and project knowledge shouldn’t disappear when a
              conversation ends. Keep them in readable local files, ready for
              you and your agents to pick up again.
            </p>
            <a
              className="text-link"
              href={`${repo}/blob/main/docs/en/guides/mcp-integration.md`}
            >
              Connect your AI tools <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="terminal">
            <div className="terminal-top">
              <span />
              <span />
              <span />
              <small>your project · knowme</small>
            </div>
            <pre>
              <span># Start with shared context</span>
              {"\n"}$ knowme init{"\n\n"}
              <span># Save what matters</span>
              {"\n"}$ knowme memo add "An idea for later"{"\n\n"}
              <span># Find it when you need it</span>
              {"\n"}$ knowme search "project decisions"{"\n\n"}
              <span># Open your workspace</span>
              {"\n"}$ knowme browser
            </pre>
          </div>
        </section>
        <section id="faq" className="faq content-width">
          <div className="section-heading">
            <h2>A few things to know.</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section id="get-started" className="get-started content-width">
          <Brain size={30} strokeWidth={1.3} />
          <h2>
            Give your next idea
            <br /> a place to stay.
          </h2>
          <p>Start building your own local memory with KnowMe.</p>
          <div className="install-command">
            <code>{install}</code>
            <button
              onClick={copyInstall}
              aria-label="Copy installation command"
            >
              {copyState === "copied" ? (
                <Check size={17} />
              ) : (
                <Copy size={17} />
              )}
            </button>
          </div>
          <p className="copy-status" role="status">
            {copyState === "copied"
              ? "Copied. Run it in your terminal to install."
              : copyState === "error"
                ? "Select and copy the command above to install."
                : "macOS, Linux & Windows · MIT licensed"}
          </p>
          <a className="text-link" href={`${repo}#installation`}>
            Installation guide <ArrowUpRight size={14} />
          </a>
        </section>
      </main>
      <footer className="site-footer">
        <a className="brand" href="#">
          <img src="/logo.png" alt="" />
          <span>KnowMe</span>
        </a>
        <span>
          © {new Date().getFullYear()} KnowMe. Open source, always yours.
        </span>
        <nav aria-label="Footer navigation">
          <a href={repo}>GitHub</a>
          <a href={`${repo}/tree/main/docs/en`}>Docs</a>
          <a href={`${repo}/blob/main/LICENSE`}>License</a>
        </nav>
      </footer>
    </>
  );
}
