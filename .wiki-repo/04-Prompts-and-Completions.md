# 4. Prompts and Completions

Manually concatenating strings or utilizing Javascript template literals (`${val}`) becomes unmanageable quickly when dealing with sophisticated enterprise flows.

The Echo AI SDK introduces the `PromptRegistry` and `PromptTemplate` features, meaning your prompts can be treated with the same respect as immutable source-code.

## The Prompt Template

A `PromptTemplate` defines its required variables mathematically, making it impossible to accidentally feed an LLM an undefined null string safely.

```typescript
import { PromptTemplate } from "echo-ai-sdk";

const greetingTemplate = new PromptTemplate({
  name: "welcome_prompt",
  version: "1.0.0",
  template: "Hello {{employee_name}}, welcome to {{department}}!",
  requiredVars: ["employee_name", "department"]
});

// Rendering enforces type checking on the dictionary layout!
console.log(greetingTemplate.render({ 
  employee_name: "John", 
  department: "Security" 
})); 
// -> "Hello John, welcome to Security!"
```

## The Prompt Registry

Rather than exporting raw `string` templates from scattered files across your codebase, build an isolated `PromptRegistry`. The registry can hold multiple versions of a single prompt simultaneously.

```typescript
import { PromptRegistry } from "echo-ai-sdk";

const registry = new PromptRegistry();

// Register the V1 Prompt
registry.register(greetingTemplate);

// We noticed the LLM was acting strangely, so we draft a V2 Prompt
registry.register(new PromptTemplate({
  name: "welcome_prompt",
  version: "2.0.0",
  template: "SYSTEM OVERRIDE: Greet user {{employee_name}} in the {{department}} department confidently.",
  requiredVars: ["employee_name", "department"]
}));
```

### Retrieving Prompts

Fetching prompts from the registry implies safety guarantees. You can easily rollback by specifying the version tag!

```typescript
// Grabs the absolute latest semantic-version registered (2.0.0)
const activePrompt = registry.getTemplate("welcome_prompt");

// Oops! V2 broke our application tests. A/B rollback to V1 instantly:
const safePrompt = registry.getTemplateVersion("welcome_prompt", "1.0.0");
```

## Gateway Streaming Completions

We covered resolving standard REST completions (`gateway.chatComplete()`) in the previous chapter.

If you are dealing with frontend applications, you almost certainly want to utilize Server-Sent Events (SSE) streaming so the user sees text generating natively.

The Gateway provides `chatStream()` returning an asynchronous iterable.

```typescript
const request = {
   messages: [{ role: "user", content: "Write a poem about Javascript." }],
   model_family: "fast"
};

const stream = gateway.chatStream(request);

// Loop natively resolves each chunk of data identically regardless of Provider
for await(const token of stream) {
   process.stdout.write(token); 
}
```

### Next Steps

With prompts templated and streams running, we can intercept data mid-flight before it is returned to the user utilizing the [Middleware Pipeline](./05-Middleware-Pipeline.md).
