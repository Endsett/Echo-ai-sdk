# Cloud Native Enterprise Deployments

If your enterprise scales beyond inference APIs to utilizing custom foundational models, the SDK features complete programmatic bridges to configure, deploy, and execute containers directly on hyperscaler computing grids.

## Abstract Deployer Modules

Echo unifies deployment orchestration into identical `Deployer` managers. Instead of grappling with bloated `.tf` templates or manual console configurations, developers script endpoint rollouts via Node.js natively.

### AWS SageMaker Deployments
```typescript
import { AwsSageMakerDeployer } from "echo-ai-sdk-ts";

const manager = new AwsSageMakerDeployer({ region: "us-east-1" });

// Uploads the target HF repository onto a dedicated ml.g5 instance seamlessly
const endpoint = await manager.deployEndpoint({
  modelName: "custom-llama3-instruct-v2",
  primaryContainerImage: "763104351884.dkr.ecr.us-east-1.amazonaws.com/huggingface-pytorch-tgi-inference...",
  executionRoleArn: "arn:aws:iam::..."
});
```

### Hugging Face Serverless
Take advantage of Hugging Face's incredibly fast dedicated deployment engine to run localized OSS models without jumping to large clouds.
```typescript
import { InferenceEndpointManager } from "echo-ai-sdk-ts";

const hfManager = new InferenceEndpointManager("hf_token");
await hfManager.createEndpoint("llama-8b-prod", {
  accountId: "my-startup",
  repository: "meta-llama/Meta-Llama-3-8B-Instruct",
  accelerator: "gpu",
  instanceSize: "medium"
});
```

*Parallel classes exist for `GcpVertexManager` (Google Cloud) and `AzureMlDeployer` (Microsoft Azure)! Review the core typed definition (`src/deployment/gcp_vertex_manager.ts`) and IDE tooltips for extensive parameter overrides and hardware integrations.*
