import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { Context } from './common/context'

interface BackendServiceNodejsStackProps extends cdk.StackProps {
    cluster: ecs.Cluster,
    backendServiceSG: ec2.SecurityGroup,
    backendTaskRole: iam.Role,
    backendTaskExecutionRole: iam.Role,
    backendLogGroup: logs.LogGroup,
    cloudmapNamespace: servicediscovery.PrivateDnsNamespace,
}

export class BackendServiceNodejsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BackendServiceNodejsStackProps) {
        super(scope, id, props);

        // ECS タスク定義
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'BackendNodejsTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
            executionRole: props.backendTaskExecutionRole,
            taskRole: props.backendTaskRole,
            runtimePlatform: {
                operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
                cpuArchitecture: ecs.CpuArchitecture.X86_64,
            },
        })

        // ECR リポジトリ
        const repository = ecr.Repository.fromRepositoryArn(
            this,
            "Repository",
            "arn:aws:ecr:ap-northeast-1:449974608116:repository/devday2019-ecsdemo-nodejs"
        )

        taskDefinition.addContainer('Container', {
          containerName: 'ecsdemo-nodejs',
          image: ecs.ContainerImage.fromEcrRepository(repository),
          memoryLimitMiB: 512,
          cpu: 256,
          logging: ecs.LogDrivers.awsLogs({
              streamPrefix: `${Context.ID_PREFIX}-BackendNodejsStream`,
              logGroup: props.backendLogGroup
          }),
          portMappings: [
            {
              containerPort: 3000,
              hostPort: 3000,
                protocol: ecs.Protocol.TCP,
            },
          ],
        });

        // ECS サービス
        new ecs.FargateService(this, 'Service', {
            serviceName: `${Context.USER_NAME}-ecsdemo-nodejs`,
            cluster: props.cluster,
            desiredCount: 3,
            assignPublicIp: true,
            taskDefinition: taskDefinition,
            enableExecuteCommand: true,
            cloudMapOptions: {
                name: `${Context.USER_NAME}-ecsdemo-nodejs`,
                cloudMapNamespace: props.cloudmapNamespace,
                dnsRecordType: servicediscovery.DnsRecordType.A,
                dnsTtl: cdk.Duration.seconds(60)
            },
            securityGroups: [props.backendServiceSG],
            deploymentController: {
                type: ecs.DeploymentControllerType.ECS, // rolling update
            },
        });
    }
}