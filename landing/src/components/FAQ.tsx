import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "What makes KnowMe's 'Duo' architecture unique?",
    answer: "Most tools are designed exclusively for humans (rich web UIs with complicated proprietary APIs) or solely for AI agents (raw unstructured Markdown dump files). KnowMe solves both simultaneously: it maintains a clean, human-navigable Kanban board and Markdown spec engine, while mirroring every state transition into structured, deterministic MCP stdio protocols for AI coding agents."
  },
  {
    question: "How do AI agents connect to KnowMe?",
    answer: "KnowMe implements the Model Context Protocol (MCP) standard over stdio. Agents like Claude Desktop, Cursor, Codex, OpenCode, and Cline register 'knowme' in their MCP configuration. The agent can immediately call tools like knowme_task_list, knowme_doc_view, and knowme_retrieve to ground their context without hallucinating."
  },
  {
    question: "Where is my data stored?",
    answer: "100% locally. Project memories, tasks, and specs live in `<repo>/.know-me/` as human-readable Markdown and JSON, meaning they are versioned by Git alongside your code. Global memos, bookmarks, and registry data live in `~/.know-me/`. There are no external databases or cloud lock-ins."
  },
  {
    question: "Can I use KnowMe as a solo developer?",
    answer: "Yes, KnowMe was engineered from day one for developers who want a frictionless local task manager that also supercharges their AI coding assistants. You get a tactile Kanban board via `knowme browser --open` and zero friction from the terminal via `knowme task create`."
  },
  {
    question: "How does the retrieve tool prevent context-window bloat?",
    answer: "Instead of feeding thousands of lines of files into an LLM prompt, KnowMe's `retrieve` tool uses hybrid BM25 and semantic ranking to return high-confidence, atomic context packs. Agents get exact specifications and task criteria in fewer than 400 tokens."
  },
  {
    question: "Is KnowMe open source?",
    answer: "Yes. KnowMe is released under the permissive MIT license. You can inspect the Go core, the React workspace, and the CLI tools directly on GitHub."
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-28 px-4 sm:px-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-4 mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141d1e] border border-[#334644] text-xs font-mono text-[#8ed6be]">
          <HelpCircle className="w-3.5 h-3.5 text-[#8ed6be]" />
          <span>QUESTIONS & SPECIFICATIONS</span>
        </div>
        <h2 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-titanium leading-tight">
          Frequently Answered.
        </h2>
        <p className="text-lg text-zinc-400 font-medium">
          Everything you need to know about local memory, MCP tooling, and the Duo philosophy.
        </p>
      </div>

      {/* Accordion */}
      <div className="space-y-3.5">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <motion.div
              key={faq.question}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.05 }}
              className={`apple-card rounded-2xl border transition-all duration-200 overflow-hidden ${
                isOpen ? "border-[#8ed6be]/40 bg-[#1b2829]/70" : "border-[#334644]"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left group active:bg-white/[0.02]"
              >
                <span className={`text-base sm:text-lg font-bold tracking-tight transition-colors ${
                  isOpen ? "text-[#8ed6be]" : "text-white group-hover:text-[#8ed6be]"
                }`}>
                  {faq.question}
                </span>
                <div className={`p-1.5 rounded-full border transition-transform duration-200 ${
                  isOpen ? "rotate-180 bg-[#2b4540] border-[#8ed6be]/40 text-[#8ed6be]" : "border-[#334644] bg-[#141d1e] text-zinc-400"
                }`}>
                  {isOpen ? (
                    <Minus className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 pt-1 text-sm sm:text-base text-zinc-300 leading-relaxed border-t border-[#334644]/60">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
