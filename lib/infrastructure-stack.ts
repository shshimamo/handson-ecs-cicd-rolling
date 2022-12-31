import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { Context } from './common/context'
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class InfrastructureStack extends cdk.Stack {
    public readonly cluster: ecs.Cluster;
    public readonly frontendServiceSG: ec2.SecurityGroup;
    public readonly backendServiceSG: ec2.SecurityGroup;
    public readonly cloudmapNamespace: servicediscovery.PrivateDnsNamespace;
    public readonly frontendTaskRole: iam.Role;
    public readonly backendCrystalTaskRole: iam.Role;
    public readonly backendNodejsTaskRole: iam.Role;
    public readonly TaskExecutionRole: iam.Role;
    public readonly frontendLogGroup: logs.LogGroup;
    public readonly backendCrystalLogGroup: logs.LogGroup;
    public readonly backendNodejsLogGroup: logs.LogGroup;
    public readonly frontendBuildProjectLogGroup: logs.LogGroup;
    public readonly blueTargetGroup: elbv2.ApplicationTargetGroup;
    public readonly frontListener: elbv2.ApplicationListener;


    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // create a VPC
        const vpc = new ec2.Vpc(this, 'VPC', {
            vpcName: `${Context.ID_PREFIX}-VPC`,
            cidr: '10.0.0.0/16',
            maxAzs: 3,
            subnetConfiguration: [
                {
                    // PublicSubnet
                    cidrMask: 24,
                    name: 'ingress',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
            ],
        });

        // セキュリティグループ(ALB)
        const albSG = new ec2.SecurityGroup(this, 'ALBSG', {
            vpc,
            securityGroupName: `${Context.ID_PREFIX}-ALBSG`,
        })
        albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))
        albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9000))

        // セキュリティグループ(ECSサービス フロントエンド)
        this.frontendServiceSG = new ec2.SecurityGroup(this, 'FrontendServiceSG',
            {
                securityGroupName: `${Context.ID_PREFIX}-FrontendServiceSG`,
                vpc: vpc,
            }
        );
        this.frontendServiceSG.addIngressRule(albSG, ec2.Port.allTcp());
        this.backendServiceSG = new ec2.SecurityGroup(this, 'BackendServiceSG',
            {
                securityGroupName: `${Context.ID_PREFIX}-BackendServiceSG`,
                vpc: vpc,
            }
        );
        this.backendServiceSG.addIngressRule(this.frontendServiceSG, ec2.Port.allTcp());

        // クラウドマップ
        this.cloudmapNamespace = new servicediscovery.PrivateDnsNamespace(this, 'Namespace',
            {
                name: `${Context.ID_PREFIX}-service`,
                vpc: vpc,
            }
        );

        // ポリシー
        const ECSExecPolicyStatement = new iam.PolicyStatement({
            sid: `${Context.ID_PREFIX}AllowECSExec`,
            resources: ['*'],
            actions: [
                'ssmmessages:CreateControlChannel', // for ECS Exec
                'ssmmessages:CreateDataChannel', // for ECS Exec
                'ssmmessages:OpenControlChannel', // for ECS Exec
                'ssmmessages:OpenDataChannel', // for ECS Exec
                'logs:CreateLogStream',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
                'logs:PutLogEvents',
            ],
        });

        this.frontendTaskRole = new iam.Role(this, 'FrontendTaskRole', {
            roleName: `${Context.ID_PREFIX}-FrontendTaskRole`,
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        this.frontendTaskRole.addToPolicy(ECSExecPolicyStatement);

        this.backendCrystalTaskRole = new iam.Role(this, 'BackendCrystalTaskRole', {
            roleName: `${Context.ID_PREFIX}-BackendCrystalTaskRole`,
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        this.backendCrystalTaskRole.addToPolicy(ECSExecPolicyStatement);

        this.backendNodejsTaskRole = new iam.Role(this, 'BackendNodejsTaskRole', {
            roleName: `${Context.ID_PREFIX}-BackendNodejsTaskRole`,
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        this.backendNodejsTaskRole.addToPolicy(ECSExecPolicyStatement);

        this.TaskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
            roleName: `${Context.ID_PREFIX}-TaskExecutionRole`,
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                {
                    managedPolicyArn:
                        'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
                },
            ],
        });

        // ロググループ
        this.frontendLogGroup = new logs.LogGroup(this, 'frontendLogGroup', {
            logGroupName: `${Context.ID_PREFIX}-frontend-service`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.backendCrystalLogGroup = new logs.LogGroup(this, 'BackendCrystalLogGroup', {
            logGroupName: `${Context.ID_PREFIX}-backend-crystal-service`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.backendNodejsLogGroup = new logs.LogGroup(this, 'BackendNodejsLogGroup', {
            logGroupName: `${Context.ID_PREFIX}-backend-nodejs-service`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.frontendBuildProjectLogGroup = new logs.LogGroup(this, 'frontendBuildProjectLogGroup', {
            logGroupName: `${Context.ID_PREFIX}-frontend-build-project`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Application Load Balancer
        const ecsAlb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
            vpc,
            securityGroup: albSG,
            internetFacing: true,
            loadBalancerName: `${Context.ID_PREFIX}-ALB`,
            vpcSubnets: { subnets: vpc.publicSubnets },
        })

        // Blue リスナー
        this.frontListener = ecsAlb.addListener('Front-Listener', {
            port: 80,
            open: true,
        })

        // Blue TG
        this.blueTargetGroup = new elbv2.ApplicationTargetGroup(this, 'Blue-TargetGroup', {
            vpc,
            targetGroupName: `${Context.ID_PREFIX}-Blue-TargetGroup`,
            protocol: elbv2.ApplicationProtocol.HTTP,
            port: 3000,
            healthCheck: {
                path: '/health',
            },
            targetType: elbv2.TargetType.IP,
        })
        this.frontListener.addTargetGroups('Add-Blue-TargetGroup', {
            targetGroups: [this.blueTargetGroup],
        })

        // ECS cluster
        this.cluster = new ecs.Cluster(this, 'ECSCluster', {
            vpc: vpc,
            clusterName: `${Context.ID_PREFIX}-ECSCluster`,
            containerInsights: true,
        });
    }
}
