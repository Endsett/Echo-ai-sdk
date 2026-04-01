import { SageMakerClient, CreateModelCommand, CreateEndpointConfigCommand, CreateEndpointCommand, DescribeEndpointCommand } from "@aws-sdk/client-sagemaker";

export interface AwsSageMakerConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface SageMakerDeploymentParams {
  modelName: string;
  primaryContainerImage: string; // e.g., HuggingFace DLC (Deep Learning Container) ECR image URI
  modelDataUrl?: string;         // S3 path to model artifacts
  executionRoleArn: string;
  instanceType?: string;         // e.g., "ml.g5.xlarge"
  initialInstanceCount?: number;
}

/**
 * Enterprise deployer for provisioning custom models to AWS SageMaker Endpoints.
 * Wraps boilerplate SageMaker APIs (Model -> EndpointConfig -> Endpoint).
 */
export class AwsSageMakerDeployer {
  private client: SageMakerClient;

  constructor(config: AwsSageMakerConfig) {
    this.client = new SageMakerClient({
      region: config.region,
      credentials: config.credentials,
    });
  }

  /**
   * Orchestrates the 3-step SageMaker deployment process.
   */
  async deployEndpoint(params: SageMakerDeploymentParams): Promise<string> {
    const configName = `${params.modelName}-config-${Date.now()}`;
    const endpointName = `${params.modelName}-endpoint`;

    try {
      // 1. Create Model
      await this.client.send(new CreateModelCommand({
        ModelName: params.modelName,
        PrimaryContainer: {
          Image: params.primaryContainerImage,
          ModelDataUrl: params.modelDataUrl,
          Environment: {
            // HF specific deployment variables if using Hugging Face DLC
            "HF_MODEL_ID": params.modelName,
            "HF_TASK": "text-generation"
          }
        },
        ExecutionRoleArn: params.executionRoleArn
      }));

      // 2. Create Endpoint Config
      await this.client.send(new CreateEndpointConfigCommand({
        EndpointConfigName: configName,
        ProductionVariants: [{
          VariantName: "AllTraffic",
          ModelName: params.modelName,
          InitialInstanceCount: params.initialInstanceCount || 1,
          InstanceType: (params.instanceType || "ml.g5.xlarge") as any,
        }]
      }));

      // 3. Create Endpoint
      await this.client.send(new CreateEndpointCommand({
        EndpointName: endpointName,
        EndpointConfigName: configName
      }));

      return endpointName;
    } catch (e: any) {
      throw new Error(`AWS SageMaker deployment failed: ${e.message}`);
    }
  }

  /**
   * Checks the provisioning status of a SageMaker Endpoint.
   */
  async getEndpointStatus(endpointName: string): Promise<string> {
    const res = await this.client.send(new DescribeEndpointCommand({ EndpointName: endpointName }));
    return res.EndpointStatus || "Unknown"; // e.g., Creating, InService, Failed
  }
}
