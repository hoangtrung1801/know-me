package models

// Template holds the parsed contents of a _template.yaml configuration file.
type Template struct {
	// Name is the unique template identifier (matches the folder name).
	Name        string `yaml:"name"                  json:"name"`
	Description string `yaml:"description,omitempty" json:"description,omitempty"`
	Version     string `yaml:"version,omitempty"     json:"version,omitempty"`
	Author      string `yaml:"author,omitempty"      json:"author,omitempty"`

	// Destination is the base output path relative to the project root.
	Destination string `yaml:"destination,omitempty" json:"destination,omitempty"`

	// Doc is the path to a Knowns documentation page linked to this template
	// (e.g., "patterns/controller").
	Doc string `yaml:"doc,omitempty" json:"doc,omitempty"`

	Prompts  []TemplatePrompt  `yaml:"prompts,omitempty"  json:"prompts,omitempty"`
	Actions  []TemplateAction  `yaml:"actions,omitempty"  json:"actions,omitempty"`
	Messages *TemplateMessages `yaml:"messages,omitempty" json:"messages,omitempty"`

	// Path is the absolute filesystem path to the template folder.
	// Derived at load time; not stored in _template.yaml.
	Path string `yaml:"-" json:"path,omitempty"`

	// IsImported indicates this template originates from an imported package.
	IsImported bool `yaml:"-" json:"imported,omitempty"`

	// ImportName is the package name when IsImported is true.
	ImportName string `yaml:"-" json:"importName,omitempty"`
}

// TemplatePrompt defines an interactive prompt shown to the user before code
// generation runs.
type TemplatePrompt struct {
	// Name is the variable name injected into Handlebars templates.
	Name string `yaml:"name" json:"name"`

	// Type is one of: "text", "confirm", "select", "multiselect", "number".
	Type    string `yaml:"type"              json:"type"`
	Message string `yaml:"message"           json:"message"`

	// Validate is "required" or a custom error message.
	Validate string `yaml:"validate,omitempty" json:"validate,omitempty"`

	// Initial is the default value (string, number, or boolean serialised as
	// string for uniform YAML representation).
	Initial string `yaml:"initial,omitempty" json:"initial,omitempty"`

	Hint string `yaml:"hint,omitempty" json:"hint,omitempty"`

	// When is a Handlebars expression that controls whether this prompt is
	// shown.
	When string `yaml:"when,omitempty" json:"when,omitempty"`

	// Choices is populated for "select" and "multiselect" prompt types.
	Choices []PromptChoice `yaml:"choices,omitempty" json:"choices,omitempty"`
}

// PromptChoice is a single option in a select or multiselect prompt.
type PromptChoice struct {
	Title       string `yaml:"title"                json:"title"`
	Value       string `yaml:"value"                json:"value"`
	Description string `yaml:"description,omitempty" json:"description,omitempty"`
	Selected    bool   `yaml:"selected,omitempty"   json:"selected,omitempty"`
}

// TemplateAction describes one file-generation step executed by the template
// engine. The Type field determines which subset of fields is relevant:
//
//   - "add"      — create a single file (Template + Path)
//   - "addMany"  — create multiple files from a folder (Source + Destination + GlobPattern)
//   - "modify"   — edit an existing file in-place (Path + Pattern + Template)
//   - "append"   — append content to an existing file (Path + Template + Unique + Separator)
type TemplateAction struct {
	// Type is one of: "add", "addMany", "modify", "append".
	Type string `yaml:"type" json:"type"`

	// Template is the Handlebars source template file path (relative to the
	// template folder). Used by "add", "modify", and "append".
	Template string `yaml:"template,omitempty" json:"template,omitempty"`

	// Path is the destination file path (supports Handlebars). Used by "add",
	// "modify", and "append".
	Path string `yaml:"path,omitempty" json:"path,omitempty"`

	// SkipIfExists prevents overwriting existing files in "add" and "addMany".
	SkipIfExists bool `yaml:"skipIfExists,omitempty" json:"skipIfExists,omitempty"`

	// When is a Handlebars expression; if it evaluates to a falsy string the
	// action is skipped.
	When string `yaml:"when,omitempty" json:"when,omitempty"`

	// Source is the source folder for "addMany" (relative to template folder).
	Source string `yaml:"source,omitempty" json:"source,omitempty"`

	// Destination is the output folder for "addMany" (supports Handlebars).
	Destination string `yaml:"destination,omitempty" json:"destination,omitempty"`

	// GlobPattern filters which files are processed in "addMany".
	GlobPattern string `yaml:"globPattern,omitempty" json:"globPattern,omitempty"`

	// Pattern is a string or regex used by "modify" to locate the replacement
	// point.
	Pattern string `yaml:"pattern,omitempty" json:"pattern,omitempty"`

	// Unique skips "append" when the content already exists in the target file.
	Unique bool `yaml:"unique,omitempty" json:"unique,omitempty"`

	// Separator is inserted before appended content in "append".
	Separator string `yaml:"separator,omitempty" json:"separator,omitempty"`
}

// TemplateMessages holds the success and failure messages displayed after a
// template run.
type TemplateMessages struct {
	Success string `yaml:"success,omitempty" json:"success,omitempty"`
	Failure string `yaml:"failure,omitempty" json:"failure,omitempty"`
}

// TemplateResult is returned by the template engine after running a template.
type TemplateResult struct {
	Success  bool     `json:"success"`
	Error    string   `json:"error,omitempty"`
	Created  []string `json:"created"`
	Modified []string `json:"modified"`
	Skipped  []string `json:"skipped"`
}
