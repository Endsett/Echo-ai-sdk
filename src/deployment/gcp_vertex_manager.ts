import { EndpointServiceClient } from "@google-cloud/aiplatform";

export interface GcpVertexDeployConfig {
  project: string;
  location: string;
}

export interface VertexDeployParams {
  displayName: string;
  modelName: string; // The fully qualified resource name of the Model to deploy, e.g. "projects/123/locations/us-central1/models/456"
  machineType?: string; // e.g. "n1-standard-4"
  acceleratorType?: string; // e.g. "NVIDIA_TESLA_T4"
  acceleratorCount?: number;
}

export class GcpVertexManager {
  private client: EndpointServiceClient;
  private project: string;
  private location: string;

  constructor(config: GcpVertexDeployConfig) {
    // Requires application default credentials
    this.client = new EndpointServiceClient({
      apiEndpoint: `${config.location}-aiplatform.googleapis.com`
    });
    this.project = config.project;
    this.location = config.location;
  }

  /**
   * Deploys an uploaded Vertex AI Model Resource to a newly created Endpoint.
   */
  async deployModel(params: VertexDeployParams): Promise<string> {
    const parent = `projects/${this.project}/locations/${this.location}`;
    
    // 1. Create an Endpoint
    const [endpointLro] = await this.client.createEndpoint({
      parent,
      endpoint: { displayName: `${params.displayName}-endpoint` }
    });
    const [endpointResponse] = await endpointLro.promise();
    const endpointName = endpointResponse.name!;

    // 2. Deploy Model to Endpoint
    const [deployLro] = await this.client.deployModel({
      endpoint: endpointName,
      deployedModel: {
        model: params.modelName,
        displayName: `${params.displayName}-deployment`,
        dedicatedResources: {
          machineSpec: {
            machineType: params.machineType || "n1-standard-4",
            acceleratorType: params.acceleratorType as any || undefined,
            acceleratorCount: params.acceleratorCount || 0
          },
          minReplicaCount: 1,
          maxReplicaCount: 1
        }
      }
    });

    console.log("Waiting for Vertex AI deployment LRO to finish...");
    await deployLro.promise();

    return endpointName; // This is the resource name to send prediction requests to
  }
}
