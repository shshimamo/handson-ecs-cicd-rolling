import * as cdk from 'aws-cdk-lib';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { Context } from './common/context'
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

interface FrontendServiceStackProps extends cdk.StackProps {
    cluster: ecs.Cluster,
    frontendServiceSG: ec2.SecurityGroup,
    frontendTaskRole: iam.Role,
    frontendTaskExecutionRole: iam.Role,
    frontendLogGroup: logs.LogGroup,
    cloudmapNamespace: servicediscovery.PrivateDnsNamespace,
    blueTargetGroup: elbv2.ApplicationTargetGroup,
    greenTargetGroup: elbv2.ApplicationTargetGroup,
    frontListener: elbv2.ApplicationListener,
    frontTestListener: elbv2.ApplicationListener
}

export class FrontendServiceStack extends cdk.Stack {
    public readonly ecsDeploymentGroup: codedeploy.EcsDeploymentGroup

    constructor(scope: Construct, id: string, props: FrontendServiceStackProps) {
        super(scope, id, props);

        // ECS タスク定義
        const frontTaskDefinition = new ecs.FargateTaskDefinition(this, "FrontendTaskDef", {
            memoryLimitMiB: 512,
            cpu: 256,
            executionRole: props.frontendTaskExecutionRole,
            taskRole: props.frontendTaskRole,
            runtimePlatform: {
                operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
                cpuArchitecture: ecs.CpuArchitecture.X86_64,
            },
        });

        // ECR リポジトリ
        const frontendRepo = ecr.Repository.fromRepositoryArn(
            this,
            `${Context.ID_PREFIX}-FrontendRepository`,
            "arn:aws:ecr:ap-northeast-1:449974608116:repository/devday2019-ecsdemo-frontend"
        )

        // コンテナ
        frontTaskDefinition.addContainer('FrontendContainer', {
            containerName: 'ecsdemo-frontend',
            image: ecs.ContainerImage.fromEcrRepository(frontendRepo),
            memoryLimitMiB: 512,
            cpu: 256,
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: `${Context.ID_PREFIX}-FrontendStream`,
                logGroup: props.frontendLogGroup
            }),
            portMappings: [
                {
                    containerPort: 3000,
                    hostPort: 3000,
                    protocol: ecs.Protocol.TCP,
                },
            ],
            environment: {
                'CRYSTAL_URL': `http://${Context.USER_NAME}-ecsdemo-crystal.${props.cloudmapNamespace.namespaceName}:3000/crystal`,
                'NODEJS_URL': `http://${Context.USER_NAME}-ecsdemo-nodejs.${props.cloudmapNamespace.namespaceName}:3000`
            },
        });

        // ECS サービス
        const frontendService = new ecs.FargateService(this, 'FrontendService', {
            serviceName: `${Context.USER_NAME}-ecsdemo-frontend`,
            cluster: props.cluster,
            desiredCount: 1,
            assignPublicIp: true,
            taskDefinition: frontTaskDefinition,
            enableExecuteCommand: true,
            cloudMapOptions: {
                name: `${Context.USER_NAME}-ecsdemo-frontend`,
                cloudMapNamespace: props.cloudmapNamespace,
                dnsRecordType: servicediscovery.DnsRecordType.A,
                dnsTtl: cdk.Duration.seconds(60)
            },
            securityGroups: [props.frontendServiceSG],
            deploymentController: {
                type: ecs.DeploymentControllerType.CODE_DEPLOY,
            }
        });

        // サービスをターゲットグループに追加
        props.blueTargetGroup.addTarget(frontendService);

        // CodeDeploy の ECS アプリケーションを作成
        const ecsApplication = new codedeploy.EcsApplication(this, 'EcsApplication', {
            applicationName: `${Context.ID_PREFIX}FrontendApplication`,
        });

        // デプロイグループ
        this.ecsDeploymentGroup = new codedeploy.EcsDeploymentGroup(this, 'EcsDeploymentGroup', {
            blueGreenDeploymentConfig: {  // ターゲットグループやリスナー
                blueTargetGroup: props.blueTargetGroup,
                greenTargetGroup: props.greenTargetGroup,
                listener: props.frontListener,
                testListener: props.frontTestListener,
                deploymentApprovalWaitTime: cdk.Duration.minutes(10),
                terminationWaitTime: cdk.Duration.minutes(10),
            },
            autoRollback: {  // ロールバックの設定
                failedDeployment: true
            },
            service: frontendService,  // ECSサービス
            application: ecsApplication,  // ECSアプリケーション
            deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE, // デプロイの方式
            deploymentGroupName: `${Context.ID_PREFIX}FrontendDepGrp`,
        })

    }
}