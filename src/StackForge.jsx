import { useState, useEffect, useRef } from "react";
import { callClaude } from "./api.js";

// ─── Pure JS ZIP (no CDN - fixes download block) ──────────────────────────
const buildZip = (() => {
  const TE = new TextEncoder();
  const CT = new Uint32Array(256);
  for (let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;CT[i]=c;}
  const crc32 = d=>{let c=0xFFFFFFFF;for(let i=0;i<d.length;i++)c=CT[(c^d[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
  const u16 = n=>[n&0xFF,(n>>8)&0xFF];
  const u32 = n=>[n&0xFF,(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF];
  return fileMap=>{
    const now=new Date();
    const DT=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
    const DD=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
    const entries=[],parts=[];let off=0;
    for(const[path,content]of Object.entries(fileMap)){
      const nm=TE.encode(path),da=TE.encode(content||"");
      const crc=crc32(da);
      const lh=new Uint8Array([0x50,0x4B,0x03,0x04,20,0,0,0,0,0,...u16(DT),...u16(DD),...u32(crc),...u32(da.length),...u32(da.length),...u16(nm.length),0,0,...nm]);
      entries.push({nm,da,crc,off});parts.push(lh,da);off+=lh.length+da.length;
    }
    const cdOff=off;
    for(const e of entries){
      const cd=new Uint8Array([0x50,0x4B,0x01,0x02,20,0,20,0,0,0,0,0,...u16(DT),...u16(DD),...u32(e.crc),...u32(e.da.length),...u32(e.da.length),...u16(e.nm.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(e.off),...e.nm]);
      parts.push(cd);off+=cd.length;
    }
    parts.push(new Uint8Array([0x50,0x4B,0x05,0x06,0,0,0,0,...u16(entries.length),...u16(entries.length),...u32(off-cdOff),...u32(cdOff),0,0]));
    const total=parts.reduce((s,p)=>s+p.length,0);
    const out=new Uint8Array(total);let pos=0;
    for(const p of parts){out.set(p,pos);pos+=p.length;}
    return out;
  };
})();

// ─── Static config ───────────────────────────────────────────────────────
const CLOUDS=[
  {id:"aws",  label:"AWS",  icon:"☁️", color:"#FF9900"},
  {id:"azure",label:"Azure",icon:"🔷",color:"#0078D4"},
  {id:"gcp",  label:"GCP",  icon:"🟡",color:"#4285F4"},
];
const PIPELINES=[
  {id:"github",       label:"GitHub Actions",     icon:"⚙️"},
  {id:"gitlab",       label:"GitLab CI",           icon:"🦊"},
  {id:"azure_devops", label:"Azure Pipelines",     icon:"🔷"},
  {id:"jenkins",      label:"Jenkins",             icon:"🎩"},
  {id:"codepipeline", label:"AWS CodePipeline",    icon:"🚀"},
  {id:"bitbucket",    label:"Bitbucket Pipelines", icon:"🪣"},
];
const IAC_TOOLS=[
  {id:"terraform",      label:"Terraform",      sub:"module-based",      onlyCloud:null},
  {id:"terragrunt",     label:"Terragrunt",     sub:"multi-env DRY",     onlyCloud:null},
  {id:"cloudformation", label:"CloudFormation", sub:"AWS native",        onlyCloud:"aws"},
  {id:"bicep",          label:"Bicep",          sub:"Azure native",      onlyCloud:"azure"},
  {id:"arm",            label:"ARM Templates",  sub:"Azure JSON native", onlyCloud:"azure"},
  {id:"pulumi",         label:"Pulumi",         sub:"multi-cloud",       onlyCloud:null},
];
const DEPLOY_TARGETS={
  aws:  [
    {id:"ec2",      label:"EC2 (Auto Scaling)", icon:"🖥️", note:"AMI + Launch Template + ALB"},
    {id:"ecs",      label:"ECS (Fargate)",       icon:"🐳", note:"Serverless containers"},
    {id:"eks",      label:"EKS + Helm",          icon:"⎈",  note:"Managed Kubernetes"},
  ],
  azure:[
    {id:"vm",       label:"VM Scale Set",        icon:"🖥️", note:"VMSS + Load Balancer"},
    {id:"aca",      label:"Container Apps",      icon:"📦", note:"Serverless containers"},
    {id:"aks",      label:"AKS + Helm",          icon:"⎈",  note:"Managed Kubernetes"},
  ],
  gcp:  [
    {id:"gce",      label:"Compute Engine MIG",  icon:"🖥️", note:"MIG + HTTP LB"},
    {id:"cloud_run",label:"Cloud Run",           icon:"🏃", note:"Serverless containers"},
    {id:"gke",      label:"GKE + Helm",          icon:"⎈",  note:"Managed Kubernetes"},
  ],
};
const TABS=[
  {id:"iac",        label:"IaC",         icon:"🏗️"},
  {id:"pipeline",   label:"Pipelines",   icon:"🔁"},
  {id:"stack",      label:"App Stack",   icon:"🐳"},
  {id:"security",   label:"Security",    icon:"🔐"},
  {id:"secrets",    label:"Secrets",     icon:"🔑"},
  {id:"observability",label:"Observability",icon:"📊"},
  {id:"config",     label:"Config Mgmt", icon:"🔧"},
  {id:"runbook",    label:"Runbook",     icon:"📋"},
];
const EXTRAS=["Auto-scaling","Multi-AZ / HA","WAF + DDoS","Monitoring","Cost Budgets","Backup & DR"];

// ─── Regions ─────────────────────────────────────────────────────────────
const REGIONS={
  aws:["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-central-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","sa-east-1","ca-central-1"],
  azure:["eastus","eastus2","westus2","westus3","centralus","northeurope","westeurope","uksouth","eastasia","southeastasia","australiaeast","brazilsouth"],
  gcp:["us-central1","us-east1","us-east4","us-west1","us-west2","europe-west1","europe-west2","europe-west4","asia-east1","asia-southeast1","australia-southeast1","southamerica-east1"],
};

// ─── Monthly cost estimates (USD) ────────────────────────────────────────
const COST_MAP={
  aws:{ec2:70,ec2_asg:140,eks_cluster:73,ecs_cluster:10,lambda:5,fargate:40,app_runner:25,batch:30,lightsail:12,beanstalk:40,outposts:500,alb:22,nlb:18,nat_gateway:45,cloudfront:15,route53:5,api_gw_rest:15,api_gw_http:8,api_gw_ws:12,transit_gw:55,global_acc:35,direct_connect:300,privatelink:10,vpc_peering:5,elastic_ip:4,rds_postgres:45,rds_mysql:45,rds_mariadb:40,rds_sqlserver:120,aurora_pg:90,aurora_mysql:90,dynamodb:25,elasticache_r:35,elasticache_m:30,documentdb:80,neptune:120,timestream:25,keyspaces:40,memorydb:80,s3:10,efs:30,ebs:20,fsx_windows:150,fsx_lustre:200,glacier:5,storage_gw:100,aws_backup:15,sqs:5,sns:5,eventbridge:5,kinesis_str:30,kinesis_fh:25,kinesis_an:50,msk:120,mq:50,step_fn:15,appsync:20,kms:10,secrets_mgr:5,waf:25,shield:3000,guard_duty:30,security_hub:20,acm:0,inspector:10,macie:15,cognito:10,cloudwatch:10,cloudtrail:5,xray:5,ssm:5,config_svc:5,ecr:5,codebuild:20,codedeploy:5,codecommit:5,codeartifact:10,redshift:250,athena:15,glue:80,emr:200,opensearch:100,quicksight:25,sagemaker:150,bedrock:20,rekognition:15},
  azure:{vm:70,vmss:140,aks_cluster:73,app_service:55,az_functions:5,container_apps:25,spring_apps:80,az_batch:50,service_fabric:100,app_gateway:45,azure_lb:18,front_door:35,azure_cdn:15,api_mgmt:150,vpn_gateway:100,expressroute:300,azure_dns:5,traffic_mgr:10,priv_endpoint:8,az_nat:45,bastion:180,az_firewall:900,azure_sql:55,sql_mi:400,cosmos_db:80,pg_flexible:45,mysql_flex:40,redis_cache:40,synapse:200,data_factory:60,az_search:80,blob_storage:8,azure_files:25,table_storage:5,queue_az:5,data_lake:20,az_backup:20,service_bus:10,event_hubs:25,event_grid:5,logic_apps:15,notif_hubs:15,key_vault:5,entra_id:6,defender:15,sentinel:100,ddos_prot:2944,managed_hsm:1500,az_monitor:15,app_insights:10,log_analytics:20,net_watcher:5,az_databricks:200,power_bi:10,azure_openai:30,cognitive_svc:20,az_ml:100},
  gcp:{compute_engine:70,gke_cluster:73,cloud_run:15,cloud_fn:5,app_engine:30,gce_mig:140,cloud_batch_g:40,gcp_vpc:5,http_lb:20,tcp_lb:15,cloud_cdn:12,cloud_dns:5,cloud_nat:45,cloud_armor:25,cloud_router:10,cloud_ic:300,iap:0,cloud_sql_pg:45,cloud_sql_my:45,cloud_spanner:200,firestore:20,bigtable:150,memorystore_r:35,alloydb:180,bigquery:50,gcs_bucket:8,filestore:200,persistent_d:20,gcp_backup:15,pubsub:8,cloud_tasks:5,cloud_sched:5,eventarc:5,workflows:5,dataflow:60,secret_mgr:5,cloud_kms:5,cloud_id:6,artifact_reg:10,binary_auth:0,cloud_mon:10,cloud_log:15,cloud_trace:5,error_rep:0,looker:35,dataproc:100,vertex_ai:100,vision_ai:15},
};

// ─── Environment presets ─────────────────────────────────────────────────
const buildRes=(cloud,defs)=>defs.map(d=>{const svc=(SC[cloud]||{Compute:[]})[d.cat]?.find(s=>s.id===d.id)||{id:d.id,label:d.id,abbr:d.id.toUpperCase().slice(0,4),cat:d.cat};return{serviceId:d.id,label:svc.label,abbr:svc.abbr,cat:d.cat,count:d.n,names:d.names};});
const PRESETS=[
  {id:"starter",   label:"Starter",    icon:"🌱",desc:"Single-region, quick launch",
   aws:[{id:"alb",cat:"Network",n:1,names:["alb-main"]},{id:"ecs_cluster",cat:"Compute",n:1,names:["ecs-app"]},{id:"rds_postgres",cat:"Database",n:1,names:["db-main"]},{id:"s3",cat:"Storage",n:1,names:["assets-bucket"]},{id:"secrets_mgr",cat:"Security",n:1,names:["app-secrets"]}],
   azure:[{id:"app_service",cat:"Compute",n:1,names:["webapp-main"]},{id:"pg_flexible",cat:"Database",n:1,names:["db-main"]},{id:"blob_storage",cat:"Storage",n:1,names:["assets"]},{id:"key_vault",cat:"Security",n:1,names:["kv-main"]}],
   gcp:[{id:"cloud_run",cat:"Compute",n:1,names:["api-main"]},{id:"cloud_sql_pg",cat:"Database",n:1,names:["db-main"]},{id:"gcs_bucket",cat:"Storage",n:1,names:["assets"]}]},
  {id:"startup",   label:"Startup",    icon:"🚀",desc:"Managed K8s, HA, CDN, WAF",
   aws:[{id:"eks_cluster",cat:"Compute",n:1,names:["eks-prod"]},{id:"alb",cat:"Network",n:2,names:["alb-external","alb-internal"]},{id:"nat_gateway",cat:"Network",n:2,names:["nat-az1","nat-az2"]},{id:"aurora_pg",cat:"Database",n:1,names:["aurora-prod"]},{id:"elasticache_r",cat:"Database",n:1,names:["cache-prod"]},{id:"s3",cat:"Storage",n:2,names:["assets","backups"]},{id:"cloudfront",cat:"Network",n:1,names:["cdn-prod"]},{id:"waf",cat:"Security",n:1,names:["waf-prod"]},{id:"secrets_mgr",cat:"Security",n:1,names:["app-secrets"]},{id:"kms",cat:"Security",n:1,names:["kms-main"]}],
   azure:[{id:"aks_cluster",cat:"Compute",n:1,names:["aks-prod"]},{id:"app_gateway",cat:"Network",n:1,names:["agw-prod"]},{id:"az_nat",cat:"Network",n:2,names:["nat-az1","nat-az2"]},{id:"pg_flexible",cat:"Database",n:1,names:["db-prod"]},{id:"redis_cache",cat:"Database",n:1,names:["cache-prod"]},{id:"blob_storage",cat:"Storage",n:2,names:["assets","backups"]},{id:"front_door",cat:"Network",n:1,names:["afd-prod"]},{id:"key_vault",cat:"Security",n:1,names:["kv-prod"]}],
   gcp:[{id:"gke_cluster",cat:"Compute",n:1,names:["gke-prod"]},{id:"http_lb",cat:"Network",n:1,names:["lb-prod"]},{id:"cloud_nat",cat:"Network",n:2,names:["nat-1","nat-2"]},{id:"cloud_sql_pg",cat:"Database",n:1,names:["db-prod"]},{id:"memorystore_r",cat:"Database",n:1,names:["cache-prod"]},{id:"gcs_bucket",cat:"Storage",n:2,names:["assets","backups"]},{id:"cloud_armor",cat:"Security",n:1,names:["armor-prod"]}]},
  {id:"production",label:"Production", icon:"⚡",desc:"Multi-AZ, full security, observability",
   aws:[{id:"eks_cluster",cat:"Compute",n:2,names:["eks-prod","eks-staging"]},{id:"alb",cat:"Network",n:2,names:["alb-ext","alb-int"]},{id:"nat_gateway",cat:"Network",n:3,names:["nat-az1","nat-az2","nat-az3"]},{id:"aurora_pg",cat:"Database",n:1,names:["aurora-prod"]},{id:"elasticache_r",cat:"Database",n:2,names:["cache-prod","cache-staging"]},{id:"s3",cat:"Storage",n:3,names:["assets","backups","logs"]},{id:"cloudfront",cat:"Network",n:1,names:["cdn-prod"]},{id:"waf",cat:"Security",n:1,names:["waf-prod"]},{id:"guard_duty",cat:"Security",n:1,names:["gd-prod"]},{id:"kms",cat:"Security",n:2,names:["kms-app","kms-logs"]},{id:"secrets_mgr",cat:"Security",n:1,names:["prod-secrets"]},{id:"cloudwatch",cat:"Monitoring",n:1,names:["cw-prod"]}],
   azure:[],gcp:[]},
  {id:"enterprise", label:"Enterprise",icon:"🏢",desc:"Multi-region DR, compliance-ready",
   aws:[{id:"eks_cluster",cat:"Compute",n:2,names:["eks-primary","eks-dr"]},{id:"alb",cat:"Network",n:4,names:["alb-ext-primary","alb-int-primary","alb-ext-dr","alb-int-dr"]},{id:"nat_gateway",cat:"Network",n:4,names:["nat-p-az1","nat-p-az2","nat-dr-az1","nat-dr-az2"]},{id:"aurora_pg",cat:"Database",n:2,names:["aurora-primary","aurora-dr"]},{id:"elasticache_r",cat:"Database",n:2,names:["cache-primary","cache-dr"]},{id:"s3",cat:"Storage",n:4,names:["assets","backups","logs","dr-backups"]},{id:"cloudfront",cat:"Network",n:2,names:["cdn-global","cdn-failover"]},{id:"waf",cat:"Security",n:2,names:["waf-primary","waf-dr"]},{id:"guard_duty",cat:"Security",n:1,names:["gd-global"]},{id:"security_hub",cat:"Security",n:1,names:["sh-global"]},{id:"kms",cat:"Security",n:3,names:["kms-primary","kms-dr","kms-logs"]},{id:"secrets_mgr",cat:"Security",n:2,names:["prod-secrets","dr-secrets"]},{id:"cloudwatch",cat:"Monitoring",n:1,names:["cw-prod"]},{id:"cloudtrail",cat:"Monitoring",n:1,names:["trail-prod"]}],
   azure:[],gcp:[]},
];

// ─── Compliance profiles ──────────────────────────────────────────────────
const COMPLIANCE=[
  {id:"",       label:"None",      color:"#475569",extra:""},
  {id:"soc2",   label:"SOC 2",     color:"#3b82f6",extra:"Enforce SOC 2 CC6/CC7/CC8 controls: MFA on all accounts, encrypted at rest and in transit, access logging, principle of least privilege, quarterly access reviews."},
  {id:"pci",    label:"PCI-DSS",   color:"#ef4444",extra:"Enforce PCI-DSS v4.0: network segmentation (cardholder data environment isolated), TLS 1.2+ only, log all access to cardholder data, WAF required, vulnerability scanning, no default credentials, tokenize card data."},
  {id:"hipaa",  label:"HIPAA",     color:"#10b981",extra:"Enforce HIPAA: PHI encrypted at rest (AES-256) and in transit (TLS 1.2+), audit logs for all PHI access, automatic session timeout, BAA required for all services, no PHI in logs."},
  {id:"iso27001",label:"ISO 27001",color:"#8b5cf6",extra:"Enforce ISO 27001 Annex A controls: ISMS scope defined, risk register, asset inventory, change management, incident response, business continuity, supplier security."},
];

// ─── Category brand colors per cloud ─────────────────────────────────────
const CAT_BG={
  aws:{
    Compute:"#ED7100",Network:"#8C4FFF",Database:"#527FFF",
    Storage:"#7AA116",Messaging:"#E7157B",Security:"#DD344C",
    Monitoring:"#C7131F",DevOps:"#006B9D",Analytics:"#8C4FFF",AI:"#01A88D",
  },
  azure:{
    Compute:"#0072C6",Network:"#0089D6",Database:"#035BDA",
    Storage:"#0078D4",Messaging:"#5B4BBE",Security:"#0078D4",
    Monitoring:"#0062AD",DevOps:"#0062AD",Analytics:"#7B2D8B",AI:"#4B2D8B",
  },
  gcp:{
    Compute:"#4285F4",Network:"#34A853",Database:"#4285F4",
    Storage:"#FBBC04",Messaging:"#EA4335",Security:"#EA4335",
    Monitoring:"#34A853",DevOps:"#4285F4",Analytics:"#9C27B0",AI:"#0F9D58",
  },
};

// ─── Service Catalog (170+ services) ─────────────────────────────────────
const SC={
  aws:{
    Compute:[
      {id:"ec2",           label:"EC2 Instance",        abbr:"EC2",  desc:"Virtual machine on demand"},
      {id:"ec2_asg",       label:"Auto Scaling Group",  abbr:"ASG",  desc:"Auto-scaling EC2 fleet"},
      {id:"eks_cluster",   label:"EKS Cluster",         abbr:"EKS",  desc:"Managed Kubernetes"},
      {id:"ecs_cluster",   label:"ECS Cluster",         abbr:"ECS",  desc:"Managed container service"},
      {id:"lambda",        label:"Lambda Function",     abbr:"λ",    desc:"Serverless function"},
      {id:"fargate",       label:"Fargate",             abbr:"FGT",  desc:"Serverless containers"},
      {id:"app_runner",    label:"App Runner",          abbr:"AR",   desc:"Fully managed containers"},
      {id:"batch",         label:"AWS Batch",           abbr:"BCH",  desc:"Batch computing jobs"},
      {id:"lightsail",     label:"Lightsail",           abbr:"LS",   desc:"Simple cloud hosting"},
      {id:"beanstalk",     label:"Elastic Beanstalk",   abbr:"EB",   desc:"PaaS app deployment"},
      {id:"outposts",      label:"AWS Outposts",        abbr:"OPT",  desc:"On-premises AWS infra"},
    ],
    Network:[
      {id:"alb",           label:"App Load Balancer",   abbr:"ALB",  desc:"Layer 7 load balancer"},
      {id:"nlb",           label:"Network LB",          abbr:"NLB",  desc:"Layer 4 load balancer"},
      {id:"nat_gateway",   label:"NAT Gateway",         abbr:"NAT",  desc:"Outbound internet for private subnets"},
      {id:"cloudfront",    label:"CloudFront CDN",      abbr:"CF",   desc:"Global CDN + WAF"},
      {id:"route53",       label:"Route 53",            abbr:"R53",  desc:"DNS + health checks"},
      {id:"api_gw_rest",   label:"API Gateway REST",    abbr:"AGW",  desc:"REST API management"},
      {id:"api_gw_http",   label:"API Gateway HTTP",    abbr:"AGWH", desc:"HTTP API (low latency)"},
      {id:"api_gw_ws",     label:"API Gateway WS",      abbr:"AGWW", desc:"WebSocket API"},
      {id:"transit_gw",    label:"Transit Gateway",     abbr:"TGW",  desc:"Hub-and-spoke VPC routing"},
      {id:"global_acc",    label:"Global Accelerator",  abbr:"GA",   desc:"Anycast edge routing"},
      {id:"direct_connect",label:"Direct Connect",      abbr:"DX",   desc:"Dedicated network line"},
      {id:"privatelink",   label:"PrivateLink",         abbr:"PL",   desc:"Private service endpoint"},
      {id:"vpc_peering",   label:"VPC Peering",         abbr:"VPC",  desc:"Cross-VPC connectivity"},
      {id:"elastic_ip",    label:"Elastic IP",          abbr:"EIP",  desc:"Static public IP"},
    ],
    Database:[
      {id:"rds_postgres",  label:"RDS PostgreSQL",      abbr:"PG",   desc:"Managed Postgres"},
      {id:"rds_mysql",     label:"RDS MySQL",           abbr:"MY",   desc:"Managed MySQL"},
      {id:"rds_mariadb",   label:"RDS MariaDB",         abbr:"MDB",  desc:"Managed MariaDB"},
      {id:"rds_sqlserver", label:"RDS SQL Server",      abbr:"MSSQL",desc:"Managed SQL Server"},
      {id:"aurora_pg",     label:"Aurora PostgreSQL",   abbr:"AUPG", desc:"Serverless-capable Aurora PG"},
      {id:"aurora_mysql",  label:"Aurora MySQL",        abbr:"AUMY", desc:"Serverless-capable Aurora MySQL"},
      {id:"dynamodb",      label:"DynamoDB",            abbr:"DDB",  desc:"NoSQL key-value + document"},
      {id:"elasticache_r", label:"ElastiCache Redis",   abbr:"ECR",  desc:"In-memory cache"},
      {id:"elasticache_m", label:"ElastiCache Memcache",abbr:"ECM",  desc:"In-memory cache (Memcached)"},
      {id:"documentdb",    label:"DocumentDB",          abbr:"DDC",  desc:"MongoDB-compatible NoSQL"},
      {id:"neptune",       label:"Neptune",             abbr:"NPT",  desc:"Graph database"},
      {id:"timestream",    label:"Timestream",          abbr:"TS",   desc:"Time series database"},
      {id:"keyspaces",     label:"Keyspaces",           abbr:"KSP",  desc:"Cassandra-compatible"},
      {id:"memorydb",      label:"MemoryDB for Redis",  abbr:"MMR",  desc:"Redis-compatible durable"},
    ],
    Storage:[
      {id:"s3",            label:"S3 Bucket",           abbr:"S3",   desc:"Object storage"},
      {id:"efs",           label:"EFS (NFS)",           abbr:"EFS",  desc:"Shared elastic file system"},
      {id:"ebs",           label:"EBS Volume",          abbr:"EBS",  desc:"Block storage for EC2"},
      {id:"fsx_windows",   label:"FSx for Windows",     abbr:"FSW",  desc:"Windows shared file system"},
      {id:"fsx_lustre",    label:"FSx for Lustre",      abbr:"FSL",  desc:"HPC high-throughput FS"},
      {id:"glacier",       label:"S3 Glacier",          abbr:"GLC",  desc:"Long-term archival storage"},
      {id:"storage_gw",    label:"Storage Gateway",     abbr:"SGW",  desc:"Hybrid cloud storage"},
      {id:"aws_backup",    label:"AWS Backup",          abbr:"BKP",  desc:"Centralized backup service"},
    ],
    Messaging:[
      {id:"sqs",           label:"SQS Queue",           abbr:"SQS",  desc:"Message queue"},
      {id:"sns",           label:"SNS Topic",           abbr:"SNS",  desc:"Pub/sub notifications"},
      {id:"eventbridge",   label:"EventBridge Bus",     abbr:"EB",   desc:"Event bus + scheduler"},
      {id:"kinesis_str",   label:"Kinesis Data Streams",abbr:"KDS",  desc:"Real-time data streaming"},
      {id:"kinesis_fh",    label:"Kinesis Firehose",    abbr:"KFH",  desc:"Delivery to S3/Redshift"},
      {id:"kinesis_an",    label:"Kinesis Analytics",   abbr:"KAN",  desc:"SQL on streaming data"},
      {id:"msk",           label:"MSK (Kafka)",         abbr:"MSK",  desc:"Managed Apache Kafka"},
      {id:"mq",            label:"Amazon MQ",           abbr:"MQ",   desc:"Managed RabbitMQ/ActiveMQ"},
      {id:"step_fn",       label:"Step Functions",      abbr:"SFN",  desc:"Serverless workflow orchestration"},
      {id:"appsync",       label:"AppSync",             abbr:"AS",   desc:"Managed GraphQL API"},
    ],
    Security:[
      {id:"kms",           label:"KMS Key",             abbr:"KMS",  desc:"Encryption key management"},
      {id:"secrets_mgr",   label:"Secrets Manager",     abbr:"SM",   desc:"Secrets storage + rotation"},
      {id:"waf",           label:"WAF WebACL",          abbr:"WAF",  desc:"Web application firewall"},
      {id:"shield",        label:"Shield Advanced",     abbr:"SHD",  desc:"DDoS protection"},
      {id:"guard_duty",    label:"GuardDuty",           abbr:"GD",   desc:"Threat detection + ML"},
      {id:"security_hub",  label:"Security Hub",        abbr:"SH",   desc:"Centralized security findings"},
      {id:"acm",           label:"ACM Certificate",     abbr:"ACM",  desc:"TLS certificate manager"},
      {id:"inspector",     label:"Inspector",           abbr:"INS",  desc:"Vulnerability scanning"},
      {id:"macie",         label:"Macie",               abbr:"MAC",  desc:"S3 data classification"},
      {id:"cognito",       label:"Cognito",             abbr:"COG",  desc:"User auth + identity pools"},
    ],
    Monitoring:[
      {id:"cloudwatch",    label:"CloudWatch",          abbr:"CW",   desc:"Metrics, alarms, dashboards"},
      {id:"cloudtrail",    label:"CloudTrail",          abbr:"CT",   desc:"API audit logging"},
      {id:"xray",          label:"X-Ray",               abbr:"XR",   desc:"Distributed tracing"},
      {id:"ssm",           label:"Systems Manager",     abbr:"SSM",  desc:"Fleet management + automation"},
      {id:"config_svc",    label:"AWS Config",          abbr:"CFG",  desc:"Resource compliance tracking"},
    ],
    DevOps:[
      {id:"ecr",           label:"ECR Registry",        abbr:"ECR",  desc:"Container image registry"},
      {id:"codebuild",     label:"CodeBuild",           abbr:"CB",   desc:"Managed build service"},
      {id:"codedeploy",    label:"CodeDeploy",          abbr:"CD",   desc:"Automated deployments"},
      {id:"codecommit",    label:"CodeCommit",          abbr:"CC",   desc:"Git repository"},
      {id:"codeartifact",  label:"CodeArtifact",        abbr:"CA",   desc:"Package registry (npm/Maven)"},
    ],
    Analytics:[
      {id:"redshift",      label:"Redshift",            abbr:"RS",   desc:"Petabyte data warehouse"},
      {id:"athena",        label:"Athena",              abbr:"ATH",  desc:"SQL on S3 (serverless)"},
      {id:"glue",          label:"Glue",                abbr:"GLU",  desc:"ETL + data catalog"},
      {id:"emr",           label:"EMR",                 abbr:"EMR",  desc:"Hadoop/Spark cluster"},
      {id:"opensearch",    label:"OpenSearch",          abbr:"ES",   desc:"Elasticsearch-compatible"},
      {id:"quicksight",    label:"QuickSight",          abbr:"QS",   desc:"BI + dashboards"},
    ],
    AI:[
      {id:"sagemaker",     label:"SageMaker",           abbr:"SM",   desc:"ML training + endpoints"},
      {id:"bedrock",       label:"Bedrock",             abbr:"BRK",  desc:"Foundation models API"},
      {id:"rekognition",   label:"Rekognition",         abbr:"REK",  desc:"Image + video analysis"},
    ],
  },

  azure:{
    Compute:[
      {id:"vm",            label:"Virtual Machine",     abbr:"VM",   desc:"IaaS compute"},
      {id:"vmss",          label:"VM Scale Set",        abbr:"VMSS", desc:"Auto-scaling VMs"},
      {id:"aks_cluster",   label:"AKS Cluster",         abbr:"AKS",  desc:"Managed Kubernetes"},
      {id:"app_service",   label:"App Service",         abbr:"APP",  desc:"PaaS web app"},
      {id:"az_functions",  label:"Azure Functions",     abbr:"FN",   desc:"Serverless functions"},
      {id:"container_apps",label:"Container Apps",      abbr:"ACA",  desc:"Serverless containers"},
      {id:"spring_apps",   label:"Azure Spring Apps",   abbr:"ASA",  desc:"Managed Spring Boot"},
      {id:"az_batch",      label:"Azure Batch",         abbr:"BCH",  desc:"Batch HPC jobs"},
      {id:"service_fabric",label:"Service Fabric",      abbr:"SF",   desc:"Microservices platform"},
    ],
    Network:[
      {id:"app_gateway",   label:"Application Gateway", abbr:"AGW",  desc:"L7 load balancer + WAF"},
      {id:"azure_lb",      label:"Azure Load Balancer", abbr:"LB",   desc:"L4 load balancer"},
      {id:"front_door",    label:"Azure Front Door",    abbr:"AFD",  desc:"Global CDN + WAF"},
      {id:"azure_cdn",     label:"Azure CDN",           abbr:"CDN",  desc:"Content delivery network"},
      {id:"api_mgmt",      label:"API Management",      abbr:"APM",  desc:"API gateway + portal"},
      {id:"vpn_gateway",   label:"VPN Gateway",         abbr:"VPN",  desc:"Site-to-site VPN"},
      {id:"expressroute",  label:"ExpressRoute",        abbr:"ER",   desc:"Dedicated connection"},
      {id:"azure_dns",     label:"Azure DNS",           abbr:"DNS",  desc:"DNS zones + records"},
      {id:"traffic_mgr",   label:"Traffic Manager",     abbr:"TM",   desc:"DNS-based load balancing"},
      {id:"priv_endpoint", label:"Private Endpoint",    abbr:"PE",   desc:"Private service access"},
      {id:"az_nat",        label:"NAT Gateway",         abbr:"NAT",  desc:"Outbound NAT"},
      {id:"bastion",       label:"Azure Bastion",       abbr:"BAS",  desc:"Secure RDP/SSH access"},
      {id:"az_firewall",   label:"Azure Firewall",      abbr:"AFW",  desc:"Managed stateful firewall"},
    ],
    Database:[
      {id:"azure_sql",     label:"Azure SQL Database",  abbr:"SQL",  desc:"Managed SQL Server"},
      {id:"sql_mi",        label:"SQL Managed Instance",abbr:"SQLMI",desc:"Full SQL Server compatibility"},
      {id:"cosmos_db",     label:"Cosmos DB",           abbr:"CDB",  desc:"Multi-model globally distributed"},
      {id:"pg_flexible",   label:"PostgreSQL Flexible", abbr:"PG",   desc:"Managed Postgres (flexible)"},
      {id:"mysql_flex",    label:"MySQL Flexible",      abbr:"MY",   desc:"Managed MySQL (flexible)"},
      {id:"redis_cache",   label:"Azure Cache Redis",   abbr:"RDS",  desc:"Redis cache"},
      {id:"synapse",       label:"Synapse Analytics",   abbr:"SYN",  desc:"Analytics + data warehouse"},
      {id:"data_factory",  label:"Data Factory",        abbr:"ADF",  desc:"Data integration ETL"},
      {id:"az_search",     label:"Azure AI Search",     abbr:"SRCH", desc:"Full-text + vector search"},
    ],
    Storage:[
      {id:"blob_storage",  label:"Blob Storage",        abbr:"BLOB", desc:"Object storage"},
      {id:"azure_files",   label:"Azure Files",         abbr:"FILE", desc:"SMB/NFS file shares"},
      {id:"table_storage", label:"Table Storage",       abbr:"TBL",  desc:"NoSQL key-value"},
      {id:"queue_az",      label:"Queue Storage",       abbr:"QUE",  desc:"Message queue"},
      {id:"data_lake",     label:"Data Lake Gen2",      abbr:"ADLS", desc:"Analytics file system"},
      {id:"az_backup",     label:"Azure Backup",        abbr:"BKP",  desc:"Backup vault"},
    ],
    Messaging:[
      {id:"service_bus",   label:"Service Bus",         abbr:"SB",   desc:"Enterprise message broker"},
      {id:"event_hubs",    label:"Event Hubs",          abbr:"EH",   desc:"Streaming ingestion (Kafka-compat)"},
      {id:"event_grid",    label:"Event Grid",          abbr:"EG",   desc:"Event routing + subscriptions"},
      {id:"logic_apps",    label:"Logic Apps",          abbr:"LA",   desc:"No-code workflow automation"},
      {id:"notif_hubs",    label:"Notification Hubs",   abbr:"NH",   desc:"Push notifications at scale"},
    ],
    Security:[
      {id:"key_vault",     label:"Key Vault",           abbr:"KV",   desc:"Secrets + keys + certs"},
      {id:"entra_id",      label:"Microsoft Entra ID",  abbr:"AAD",  desc:"Identity + access management"},
      {id:"defender",      label:"Defender for Cloud",  abbr:"MDC",  desc:"Cloud security posture"},
      {id:"sentinel",      label:"Microsoft Sentinel",  abbr:"SIEM", desc:"SIEM + SOAR"},
      {id:"ddos_prot",     label:"DDoS Protection",     abbr:"DDoS", desc:"Network DDoS mitigation"},
      {id:"managed_hsm",   label:"Managed HSM",         abbr:"HSM",  desc:"Hardware security module"},
    ],
    Monitoring:[
      {id:"az_monitor",    label:"Azure Monitor",       abbr:"MON",  desc:"Metrics + logs + alerts"},
      {id:"app_insights",  label:"Application Insights",abbr:"AI",   desc:"APM + distributed tracing"},
      {id:"log_analytics", label:"Log Analytics",       abbr:"LA",   desc:"Log query + analysis"},
      {id:"net_watcher",   label:"Network Watcher",     abbr:"NW",   desc:"Network monitoring + NSG flows"},
    ],
    Analytics:[
      {id:"az_databricks", label:"Azure Databricks",    abbr:"ADB",  desc:"Unified analytics + ML"},
      {id:"power_bi",      label:"Power BI Embedded",   abbr:"PBI",  desc:"BI dashboards"},
    ],
    AI:[
      {id:"azure_openai",  label:"Azure OpenAI",        abbr:"AOAI", desc:"GPT + DALL-E + Embeddings"},
      {id:"cognitive_svc", label:"Cognitive Services",  abbr:"COG",  desc:"Vision, speech, language AI"},
      {id:"az_ml",         label:"Azure ML",            abbr:"AML",  desc:"ML training + deployment"},
    ],
  },

  gcp:{
    Compute:[
      {id:"compute_engine",label:"Compute Engine",      abbr:"GCE",  desc:"IaaS virtual machines"},
      {id:"gke_cluster",   label:"GKE Cluster",         abbr:"GKE",  desc:"Managed Kubernetes"},
      {id:"cloud_run",     label:"Cloud Run Service",   abbr:"RUN",  desc:"Serverless containers"},
      {id:"cloud_fn",      label:"Cloud Functions",     abbr:"CF",   desc:"Serverless functions"},
      {id:"app_engine",    label:"App Engine",          abbr:"GAE",  desc:"PaaS app hosting"},
      {id:"gce_mig",       label:"Managed Instance Group",abbr:"MIG",desc:"Auto-scaling VM group"},
      {id:"cloud_batch_g", label:"Cloud Batch",         abbr:"BCH",  desc:"Batch compute jobs"},
    ],
    Network:[
      {id:"gcp_vpc",       label:"VPC Network",         abbr:"VPC",  desc:"Virtual private cloud"},
      {id:"http_lb",       label:"Cloud HTTP LB",       abbr:"HTTPLB",desc:"Global L7 load balancer"},
      {id:"tcp_lb",        label:"Cloud TCP LB",        abbr:"TCPLB",desc:"Regional L4 load balancer"},
      {id:"cloud_cdn",     label:"Cloud CDN",           abbr:"CDN",  desc:"Global content delivery"},
      {id:"cloud_dns",     label:"Cloud DNS",           abbr:"DNS",  desc:"Managed DNS zones"},
      {id:"cloud_nat",     label:"Cloud NAT",           abbr:"NAT",  desc:"Outbound NAT for private VMs"},
      {id:"cloud_armor",   label:"Cloud Armor",         abbr:"CA",   desc:"WAF + DDoS protection"},
      {id:"cloud_router",  label:"Cloud Router",        abbr:"CR",   desc:"Dynamic BGP routing"},
      {id:"cloud_ic",      label:"Cloud Interconnect",  abbr:"CI",   desc:"Dedicated connection"},
      {id:"iap",           label:"Identity-Aware Proxy",abbr:"IAP",  desc:"Zero-trust access"},
    ],
    Database:[
      {id:"cloud_sql_pg",  label:"Cloud SQL PostgreSQL",abbr:"PG",   desc:"Managed Postgres"},
      {id:"cloud_sql_my",  label:"Cloud SQL MySQL",     abbr:"MY",   desc:"Managed MySQL"},
      {id:"cloud_spanner", label:"Cloud Spanner",       abbr:"SPAN", desc:"Globally distributed SQL"},
      {id:"firestore",     label:"Firestore",           abbr:"FS",   desc:"NoSQL document database"},
      {id:"bigtable",      label:"Bigtable",            abbr:"BT",   desc:"HBase-compatible wide-column"},
      {id:"memorystore_r", label:"Memorystore Redis",   abbr:"MEM",  desc:"Managed Redis"},
      {id:"alloydb",       label:"AlloyDB",             abbr:"ADB",  desc:"Postgres-compatible HA"},
      {id:"bigquery",      label:"BigQuery",            abbr:"BQ",   desc:"Serverless data warehouse"},
    ],
    Storage:[
      {id:"gcs_bucket",    label:"Cloud Storage",       abbr:"GCS",  desc:"Object storage"},
      {id:"filestore",     label:"Filestore",           abbr:"FS",   desc:"Managed NFS"},
      {id:"persistent_d",  label:"Persistent Disk",     abbr:"PD",   desc:"Block storage for GCE"},
      {id:"gcp_backup",    label:"Backup and DR",       abbr:"BDR",  desc:"Backup service"},
    ],
    Messaging:[
      {id:"pubsub",        label:"Pub/Sub",             abbr:"PS",   desc:"Async messaging"},
      {id:"cloud_tasks",   label:"Cloud Tasks",         abbr:"CT",   desc:"Async task queue"},
      {id:"cloud_sched",   label:"Cloud Scheduler",     abbr:"CS",   desc:"Cron job service"},
      {id:"eventarc",      label:"Eventarc",            abbr:"EA",   desc:"Event-driven integration"},
      {id:"workflows",     label:"Workflows",           abbr:"WF",   desc:"Serverless orchestration"},
      {id:"dataflow",      label:"Dataflow",            abbr:"DF",   desc:"Managed Apache Beam"},
    ],
    Security:[
      {id:"secret_mgr",    label:"Secret Manager",      abbr:"SEC",  desc:"Secrets storage + audit"},
      {id:"cloud_kms",     label:"Cloud KMS",           abbr:"KMS",  desc:"Key management + HSM"},
      {id:"cloud_id",      label:"Cloud Identity",      abbr:"CID",  desc:"Identity + access management"},
      {id:"artifact_reg",  label:"Artifact Registry",   abbr:"AR",   desc:"Container + package registry"},
      {id:"binary_auth",   label:"Binary Authorization",abbr:"BA",   desc:"Container image policy"},
    ],
    Monitoring:[
      {id:"cloud_mon",     label:"Cloud Monitoring",    abbr:"MON",  desc:"Metrics + uptime + alerting"},
      {id:"cloud_log",     label:"Cloud Logging",       abbr:"LOG",  desc:"Log management + analysis"},
      {id:"cloud_trace",   label:"Cloud Trace",         abbr:"TRC",  desc:"Distributed tracing"},
      {id:"error_rep",     label:"Error Reporting",     abbr:"ERR",  desc:"Exception monitoring"},
    ],
    Analytics:[
      {id:"looker",        label:"Looker Studio",       abbr:"LKR",  desc:"BI dashboards"},
      {id:"dataproc",      label:"Dataproc",            abbr:"DP",   desc:"Managed Spark/Hadoop"},
    ],
    AI:[
      {id:"vertex_ai",     label:"Vertex AI",           abbr:"VAI",  desc:"ML platform + Gemini"},
      {id:"vision_ai",     label:"Vision AI",           abbr:"VIS",  desc:"Image recognition API"},
    ],
  },
};

// ─── Config Management Tools ─────────────────────────────────────────────
const CONFIG_TOOLS=[
  {id:"ansible", label:"Ansible",   icon:"🔴", desc:"Agentless YAML playbooks"},
  {id:"puppet",  label:"Puppet",    icon:"🤹", desc:"Agent-based manifests (DSL)"},
  {id:"chef",    label:"Chef",      icon:"👨‍🍳", desc:"Ruby-based recipes + cookbooks"},
  {id:"salt",    label:"SaltStack", icon:"🧂", desc:"Event-driven Python automation"},
];
const CONFIG_PRESETS={
  "Web Servers":  [
    {id:"nginx",     label:"Nginx",         icon:"🟢", desc:"Reverse proxy, SSL termination, rate limiting, gzip, HTTP/2"},
    {id:"apache",    label:"Apache HTTPD",  icon:"🪶", desc:"Apache 2.4 + mod_ssl, mod_rewrite, mod_proxy, MPM tuning"},
    {id:"haproxy",   label:"HAProxy",       icon:"⚖️", desc:"L4/L7 load balancer, health checks, stats page, ACLs"},
    {id:"caddy",     label:"Caddy",         icon:"🦥", desc:"Auto HTTPS (Let's Encrypt), HTTP/3, reverse proxy"},
    {id:"traefik",   label:"Traefik",       icon:"🔀", desc:"Cloud-native reverse proxy, Let's Encrypt, Docker/K8s provider"},
    {id:"varnish",   label:"Varnish Cache", icon:"⚡", desc:"HTTP accelerator, VCL config, cache invalidation"},
  ],
  "App Servers":  [
    {id:"tomcat",    label:"Tomcat",        icon:"🐱", desc:"Tomcat 10 Servlet container, JVM tuning, thread pool, APR connector"},
    {id:"jetty",     label:"Jetty",         icon:"⛵", desc:"Embedded Java server, WebSocket, async, HTTP/2"},
    {id:"pm2",       label:"PM2",           icon:"🔄", desc:"Node.js cluster mode, ecosystem.config.js, log rotation, startup script"},
    {id:"gunicorn",  label:"Gunicorn",      icon:"🦄", desc:"Python WSGI, worker class (gevent/uvicorn), systemd socket activation"},
    {id:"uwsgi",     label:"uWSGI",         icon:"🔌", desc:"Python uWSGI, emperor mode, vassal configs, stats server"},
    {id:"puma",      label:"Puma",          icon:"🦁", desc:"Ruby Puma, clustered mode, systemd integration, before_fork hooks"},
    {id:"unicorn",   label:"Unicorn",       icon:"🦄", desc:"Ruby Unicorn, preload_app, before_fork, zero-downtime restarts"},
    {id:"passenger", label:"Passenger",     icon:"🚀", desc:"Phusion Passenger, standalone or Nginx integration, Ruby/Python/Node"},
  ],
  "Runtimes":     [
    {id:"nodejs",    label:"Node.js",       icon:"💚", desc:"Node.js LTS via nvm, npm ci, global packages, env vars"},
    {id:"java",      label:"Java/OpenJDK",  icon:"☕", desc:"OpenJDK 17/21, JAVA_HOME, heap sizing, GC tuning (G1/ZGC)"},
    {id:"python",    label:"Python",        icon:"🐍", desc:"Python 3 via pyenv, pip, venv, pipenv/poetry, uwsgi/gunicorn"},
    {id:"ruby",      label:"Ruby",          icon:"💎", desc:"Ruby via rbenv/rvm, bundler, gem config, jemalloc"},
    {id:"golang",    label:"Go",            icon:"🐹", desc:"Go toolchain, GOPATH, build flags, static binary deployment"},
    {id:"dotnet",    label:".NET",          icon:"🔵", desc:".NET 8 runtime + SDK, dotnet-install, appsettings, service user"},
    {id:"php",       label:"PHP-FPM",       icon:"🐘", desc:"PHP 8.x FPM, pool config, opcache, composer, extensions (pdo, gd, curl)"},
    {id:"erlang",    label:"Erlang/Elixir", icon:"💜", desc:"BEAM runtime, mix releases, runtime.exs, clustering"},
    {id:"rust",      label:"Rust",          icon:"🦀", desc:"Rust toolchain via rustup, cargo build --release, strip binary"},
  ],
  "Containers":   [
    {id:"docker",      label:"Docker Engine",   icon:"🐳", desc:"Docker CE, daemon.json (log-driver, storage-driver), TLS, registry mirror"},
    {id:"compose",     label:"Docker Compose",  icon:"🐙", desc:"Compose v2, production overrides, health checks, restart policies"},
    {id:"containerd",  label:"containerd",      icon:"📦", desc:"containerd + nerdctl, snapshotter config, CNI plugins"},
    {id:"buildkit",    label:"BuildKit",        icon:"🔨", desc:"BuildKit daemon, registry cache, multi-platform builds"},
    {id:"podman",      label:"Podman",          icon:"🦭", desc:"Rootless Podman, systemd quadlets, pods, auto-update"},
  ],
  "Databases":    [
    {id:"mysql_svc",   label:"MySQL Server",    icon:"🐬", desc:"MySQL 8, my.cnf tuning (innodb_buffer_pool, binlog), slow query log, users"},
    {id:"pg_svc",      label:"PostgreSQL",      icon:"🐘", desc:"PostgreSQL 15+, pg_hba.conf, postgresql.conf (shared_buffers, max_connections, WAL), pg_dump"},
    {id:"redis_svc",   label:"Redis",           icon:"⚡", desc:"Redis 7, redis.conf (maxmemory, eviction), Sentinel, ACL users, TLS"},
    {id:"mongodb_s",   label:"MongoDB",         icon:"🍃", desc:"MongoDB 7 replica set, mongod.conf, WiredTiger cache, auth, oplog size"},
    {id:"elastic",     label:"Elasticsearch",   icon:"🔍", desc:"ES 8 node, JVM heap, cluster.name, discovery, TLS, ILM policies"},
    {id:"rabbit",      label:"RabbitMQ",        icon:"🐰", desc:"RabbitMQ 3.x, vhosts, users, policies, federation, management UI"},
    {id:"kafka_svc",   label:"Kafka",           icon:"📨", desc:"Apache Kafka, server.properties, topic partitions, retention, JVM, Zookeeper"},
    {id:"cassandra",   label:"Cassandra",       icon:"💿", desc:"Cassandra 4.x, cassandra.yaml, JVM heap, snitch, compaction strategy"},
    {id:"mariadb",     label:"MariaDB",         icon:"🦭", desc:"MariaDB 10.x, Galera cluster config, my.cnf tuning, replication"},
  ],
  "Caching":      [
    {id:"memcached",   label:"Memcached",       icon:"🧠", desc:"Memcached, memory limits, connection limits, SASL auth"},
    {id:"varnish_c",   label:"Varnish Cache",   icon:"⚡", desc:"Varnish VCL rules, TTL, grace mode, backend health probes"},
    {id:"redis_cluster",label:"Redis Cluster",  icon:"🔴", desc:"Redis Cluster mode, hash slots, replica config, failover settings"},
  ],
  "Message Queues":[
    {id:"celery",      label:"Celery",          icon:"🌿", desc:"Celery workers, beat scheduler, flower monitoring, concurrency, queues"},
    {id:"sidekiq",     label:"Sidekiq",         icon:"💎", desc:"Sidekiq 7, concurrency, queues, cron jobs, web UI, Redis connection"},
    {id:"resque",      label:"Resque",          icon:"🔧", desc:"Resque workers, queue priorities, failure handling, resque-web"},
  ],
  "Monitoring":   [
    {id:"node_exp",    label:"Prometheus Exporter",icon:"📊",desc:"node_exporter: CPU, memory, disk, network, filesystem metrics"},
    {id:"grafana",     label:"Grafana",          icon:"📈", desc:"Grafana OSS, datasources.yml, provisioned dashboards, SMTP, OAuth"},
    {id:"datadog",     label:"Datadog Agent",    icon:"🐶", desc:"Datadog agent v7, integrations (mysql/nginx/docker), APM, log collection"},
    {id:"newrelic",    label:"New Relic",        icon:"📡", desc:"New Relic infra agent, on-host integrations, distributed tracing"},
    {id:"cw_agent",    label:"CloudWatch Agent", icon:"👁️", desc:"CW agent, config.json (metrics + logs), procstat, netstat"},
    {id:"otel",        label:"OpenTelemetry",    icon:"🔭", desc:"OTEL collector, receivers (OTLP/Prometheus), exporters, processors"},
    {id:"zabbix",      label:"Zabbix Agent",     icon:"👾", desc:"Zabbix agent 2, UserParameters, active checks, TLS encryption"},
    {id:"prometheus",  label:"Prometheus Server",icon:"🔥", desc:"Prometheus server, scrape_configs, alerting rules, TSDB retention, remote_write"},
    {id:"alertmanager",label:"Alertmanager",     icon:"🚨", desc:"Alertmanager, receivers (Slack/PagerDuty/email), inhibit rules, silences"},
  ],
  "Logging":      [
    {id:"filebeat",    label:"Filebeat",         icon:"📜", desc:"Filebeat 8, inputs (log/container), processors, Elasticsearch/Logstash output"},
    {id:"fluentd",     label:"Fluentd",          icon:"🌊", desc:"Fluentd, td-agent, match rules, buffer tuning, Elasticsearch/S3 output"},
    {id:"fluentbit",   label:"Fluent Bit",       icon:"🦋", desc:"Fluent Bit (lightweight), parsers, filters, multiline, Loki/ES output"},
    {id:"logstash",    label:"Logstash",         icon:"🔧", desc:"Logstash pipeline, grok patterns, mutate filters, conditional routing"},
    {id:"promtail",    label:"Promtail",         icon:"📋", desc:"Promtail (Loki agent), scrape_configs, pipeline stages, labels"},
    {id:"logrotate",   label:"Logrotate",        icon:"🔃", desc:"Logrotate, daily/weekly rotation, compress, postrotate scripts, copytruncate"},
    {id:"syslog",      label:"Rsyslog/Syslog",   icon:"📝", desc:"rsyslog, remote syslog over TLS, structured logging, log forwarding"},
  ],
  "Security":     [
    {id:"certbot",     label:"Certbot/SSL",      icon:"🔒", desc:"Let's Encrypt via certbot, standalone/webroot/DNS, auto-renew systemd timer"},
    {id:"fail2ban",    label:"Fail2ban",         icon:"🛡️", desc:"Fail2ban, jail.conf, SSH/Nginx/Apache filters, ban duration, email alerts"},
    {id:"ufw",         label:"UFW Firewall",     icon:"🔥", desc:"UFW rules (allow/deny by port/IP/subnet), logging, before.rules for DOCKER"},
    {id:"iptables",    label:"iptables/nftables", icon:"🧱",desc:"iptables or nftables rules, INPUT/OUTPUT/FORWARD chains, MASQUERADE, persistence"},
    {id:"auditd",      label:"auditd",           icon:"🔍", desc:"Linux audit daemon, audit.rules (syscall monitoring, file watches), aureport"},
    {id:"sysctl_h",    label:"Kernel Hardening", icon:"⚙️", desc:"sysctl: net.ipv4 hardening, kernel.randomize_va_space, fs.suid_dumpable, limits.conf"},
    {id:"ssh_hard",    label:"SSH Hardening",    icon:"🔑", desc:"sshd_config: disable root, PubkeyAuth only, AllowUsers, MaxAuthTries, Banner"},
    {id:"clamav",      label:"ClamAV",           icon:"🦠", desc:"ClamAV daemon, freshclam auto-update, on-access scanning, email alerts"},
    {id:"vault_ag",    label:"Vault Agent",      icon:"🔐", desc:"HashiCorp Vault agent, auto-auth (AWS IAM/AppRole), template rendering, caching"},
    {id:"selinux",     label:"SELinux",          icon:"🔴", desc:"SELinux enforcing mode, audit2allow, custom policies, booleans, fcontext"},
    {id:"apparmor",    label:"AppArmor",         icon:"🟠", desc:"AppArmor profiles for nginx/mysql/redis, enforce mode, deny rules"},
    {id:"crowdsec",    label:"CrowdSec",         icon:"👥", desc:"CrowdSec agent + bouncer, scenarios, collections, local API, hub updates"},
    {id:"wazuh",       label:"Wazuh Agent",      icon:"🦅", desc:"Wazuh HIDS agent, ossec.conf, rootcheck, file integrity monitoring, active response"},
    {id:"aide",        label:"AIDE/Tripwire",    icon:"📁", desc:"AIDE file integrity checker, database init, cron check, email on changes"},
  ],
  "System":       [
    {id:"users",       label:"Users & Sudo",     icon:"👤", desc:"useradd/usermod, sudoers.d, SSH authorized_keys, password policy (PAM)"},
    {id:"swap",        label:"Swap Space",       icon:"💱", desc:"swapfile or swap partition, vm.swappiness tuning, mkswap, swapon"},
    {id:"ntp",         label:"NTP/Chrony",       icon:"⏰", desc:"chrony or ntpd, NTP servers, stratum, makestep, RTC sync"},
    {id:"nfs_svc",     label:"NFS Server",       icon:"💾", desc:"NFS v4 server, /etc/exports, idmapd, Kerberos auth, firewall rules"},
    {id:"samba",       label:"Samba/CIFS",       icon:"🖧",  desc:"Samba server, smb.conf, shares, AD member, winbind integration"},
    {id:"cron",        label:"Cron Jobs",        icon:"⏱️", desc:"crontab/cron.d entries, user crontabs, anacron, environment variables"},
    {id:"limits",      label:"System Limits",    icon:"📏", desc:"limits.conf: nofile, nproc, stack; systemd LimitNOFILE, sysctl overrides"},
    {id:"tuned",       label:"tuned Profile",    icon:"🎛️", desc:"tuned-adm, throughput-performance/latency-performance/virtual-guest profiles"},
    {id:"grub",        label:"Kernel/GRUB",      icon:"🥾", desc:"GRUB cmdline (quiet, nosmt, mitigations), kernel parameters, dracut"},
    {id:"packages",    label:"Package Management",icon:"📦",desc:"apt/yum/dnf: unattended-upgrades, automatic security patches, package pins"},
  ],
  "Networking":   [
    {id:"keepalived",  label:"Keepalived/VRRP",  icon:"🔄", desc:"Keepalived, VRRP config, virtual IP failover, health check scripts"},
    {id:"wireguard",   label:"WireGuard VPN",    icon:"🔐", desc:"WireGuard interface config, peer setup, PostUp/PostDown rules, systemd-networkd"},
    {id:"openvpn",     label:"OpenVPN",          icon:"🛡️", desc:"OpenVPN server, TLS auth, client configs, CCD, iptables NAT, easy-rsa PKI"},
    {id:"bind9",       label:"BIND9 DNS",        icon:"🌐", desc:"BIND9 authoritative/recursive, named.conf, zone files, DNSSEC, ACLs"},
    {id:"postfix",     label:"Postfix/SMTP",     icon:"📧", desc:"Postfix main.cf, relay, TLS, SASL auth, SPF/DKIM, mailq management"},
    {id:"netplan",     label:"Netplan/Network",  icon:"🌐", desc:"netplan YAML, static IP, bonding, VLAN, routes, nameservers"},
  ],
  "Service Mesh": [
    {id:"consul",      label:"Consul Agent",     icon:"🏛️", desc:"Consul agent, service registration, health checks, KV store, ACL tokens"},
    {id:"envoy",       label:"Envoy Proxy",      icon:"🔌", desc:"Envoy static/dynamic config, clusters, listeners, xDS API, tracing"},
    {id:"linkerd",     label:"Linkerd Agent",    icon:"🔗", desc:"Linkerd proxy, mTLS, traffic metrics, retries, timeouts, circuit breaking"},
    {id:"istio_side",  label:"Istio Sidecar",    icon:"🕸️", desc:"Istio sidecar injection, VirtualService, DestinationRule, PeerAuthentication"},
  ],
  "CI/CD Agents": [
    {id:"jenkins_a",   label:"Jenkins Agent",    icon:"🎩", desc:"Jenkins JNLP agent, workDir, tunnel, credentials, Docker-in-Docker"},
    {id:"gh_runner",   label:"GitHub Runner",    icon:"⚙️", desc:"Self-hosted GitHub Actions runner, labels, groups, auto-update, service mode"},
    {id:"gl_runner",   label:"GitLab Runner",    icon:"🦊", desc:"GitLab Runner, executor (docker/shell), tags, concurrent, cache, S3"},
    {id:"az_agent",    label:"Azure DevOps Agent",icon:"🔷",desc:"Azure Pipelines self-hosted agent, capability management, agent pools"},
    {id:"argocd",      label:"ArgoCD Agent",     icon:"🐙", desc:"ArgoCD ApplicationSet, sync policies, health checks, RBAC, notifications"},
    {id:"flux",        label:"Flux CD Agent",    icon:"🌊", desc:"Flux GitOps, HelmRelease, Kustomization, image automation, SOPS decryption"},
  ],
  "Performance":  [
    {id:"pgbouncer",   label:"PgBouncer",        icon:"🏊", desc:"PgBouncer connection pooler, pool_mode (transaction/session), max_client_conn, auth_file"},
    {id:"nginx_cache", label:"Nginx Proxy Cache",icon:"🗄️", desc:"proxy_cache_path, cache zones, Cache-Control, cache bypass rules, purge"},
    {id:"bbr",         label:"TCP BBR",          icon:"📶", desc:"net.core.default_qdisc=fq, net.ipv4.tcp_congestion_control=bbr, socket buffers"},
    {id:"hugepages",   label:"HugePages",        icon:"📄", desc:"Transparent HugePages, vm.nr_hugepages, NUMA policy for Java/Redis/Postgres"},
  ],
};

// ─── Utilities ────────────────────────────────────────────────────────────
const extLang=p=>{const e=p.split(".").pop().toLowerCase();if(p.toLowerCase().includes("dockerfile"))return"dockerfile";return({tf:"hcl",hcl:"hcl",yml:"yaml",yaml:"yaml",json:"json",ts:"typescript",sh:"bash",md:"markdown",bicep:"bicep",py:"python",go:"go",js:"javascript",pp:"puppet",rb:"ruby"})[e]||e;};
const fileIcon=n=>{const e=n.split(".").pop().toLowerCase();if(n.toLowerCase().includes("dockerfile"))return"🐳";return({tf:"🟣",hcl:"🟣",yml:"🟡",yaml:"🟡",json:"🟤",ts:"🔵",sh:"🟢",md:"📝",bicep:"🔷",py:"🐍",go:"🔵",js:"🟡",pp:"🤹",rb:"💎"})[e]||"📄";};
const parseFiles=text=>{if(!text)return[];const files=[],lines=text.split("\n");let i=0;while(i<lines.length){const line=lines[i].trim();if(line.startsWith("# File:")){const path=line.replace("# File:","").trim();i++;while(i<lines.length&&lines[i].trim()==="")i++;if(i<lines.length&&lines[i].trim().startsWith("```")){i++;const c=[];while(i<lines.length&&!lines[i].trim().startsWith("```")){c.push(lines[i]);i++;}i++;files.push({path,content:c.join("\n")});}}else i++;}return files;};
const buildTree=files=>{const root={};files.forEach(({path,content})=>{const parts=path.split("/");let node=root;parts.forEach((p,i)=>{if(i===parts.length-1)node[p]={__file:true,path,content};else{node[p]=node[p]||{};node=node[p];}});});return root;};
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,20)||"myapp";

// ─── Cache ────────────────────────────────────────────────────────────────
const ck=form=>{const extras=[...form.extras].sort().join(",");const res=form.resources.map(r=>`${r.serviceId}:${r.names.join(",")}`).sort().join("|");const svcs=form.microservices.map(s=>s.name).join(",");const cfg=`${form.configTool}:${[...form.configPresets].sort().join(",")}`;return`sf:${form.cloud}:${form.pipeline}:${form.iacTool}:${form.deployTarget}:${extras}:${res}:${svcs}:${cfg}`.slice(0,180);};
const cacheGet=async key=>{try{const r=await window.storage.get(key);return r?JSON.parse(r.value):null;}catch{return null;}};
const cacheSet=async(key,val)=>{try{await window.storage.set(key,JSON.stringify(val));}catch{}};

// ─── Claude API ───────────────────────────────────────────────────────────
// ─── Claude API — proxied via Vercel /api/claude (see api.js) ──────────────

// ─── Prompt helpers ───────────────────────────────────────────────────────
const CN={aws:"AWS",azure:"Azure",gcp:"GCP"};
const PN={github:"GitHub Actions",gitlab:"GitLab CI",azure_devops:"Azure Pipelines",jenkins:"Jenkins",codepipeline:"AWS CodePipeline",bitbucket:"Bitbucket Pipelines"};
const SYS="You are a senior DevOps architect. Output ONLY file contents. Each file MUST start with '# File: path/filename.ext' on its own line, then a code block. No prose outside code blocks. Use the EXACT resource names provided. Ensure all code is syntactically valid.";

const resSummary=rs=>rs.length?rs.map(r=>`- ${r.label} (${r.count}x): ${r.names.join(", ")}`).join("\n"):"No specific resources — use sensible defaults.";
const svcSummary=ss=>ss.length?ss.map(s=>`- ${s.name} (port ${s.port})`).join("\n"):"No named microservices.";

const makePrompts=f=>{
  const isHelm=["eks","aks","gke"].includes(f.deployTarget);
  const isEC2Like=["ec2","vm","gce"].includes(f.deployTarget);
  const iacDir={terraform:"terraform",terragrunt:"terragrunt",cloudformation:"cloudformation",bicep:"bicep",arm:"arm",pulumi:"pulumi"}[f.iacTool]||"terraform";
  const registry=f.cloud==="aws"?"ECR":f.cloud==="azure"?"ACR":"GCR";
  const deployStep=
  f.deployTarget==="ec2"?"rolling EC2 deploy: (1) build AMI with Packer OR push artifact to S3, (2) update Launch Template with new AMI/version, (3) trigger Instance Refresh on ASG with min-healthy=90%, (4) wait for refresh, (5) run smoke tests against ALB DNS":
  f.deployTarget==="vm"?"Azure VMSS rolling update: az vmss update-instances + rolling upgrade policy":
  f.deployTarget==="gce"?"GCE MIG rolling update: gcloud compute instance-groups managed rolling-action start-update":
  isHelm?"helm upgrade --install --atomic --wait --set image.tag=$IMAGE_TAG with per-env values files":
  f.cloud==="aws"?"ECS rolling update (aws ecs update-service --force-new-deployment)":
  f.cloud==="azure"?"Azure Container Apps update (az containerapp update --image)":
  "Cloud Run deploy (gcloud run deploy --image)";
  const RS=resSummary(f.resources);
  const SS=svcSummary(f.microservices);
  const EI=f.existingInfra?.enabled?`
EXISTING INFRASTRUCTURE (import these values — DO NOT recreate these resources):
  vpc_id: "${f.existingInfra.vpcId||"<paste vpc-id from terraform output vpc_id>"}"
  private_subnet_ids: [${f.existingInfra.privateSubnets||"<paste from terraform output private_subnet_ids>"}]
  public_subnet_ids:  [${f.existingInfra.publicSubnets||"<paste from terraform output public_subnet_ids>"}]
  ${f.existingInfra.dbEndpoint?`db_endpoint: "${f.existingInfra.dbEndpoint}" (use data source, do NOT create new DB)`:""}
  ${f.existingInfra.dbSecretArn?`db_secret_arn: "${f.existingInfra.dbSecretArn}" (reference existing secret)`:""}
  ${f.existingInfra.additionalOutputs||""}
Use data sources to reference existing resources:
  data "aws_vpc" "existing" { id = "${f.existingInfra.vpcId||"var.existing_vpc_id"}" }
  data "aws_subnets" "private" { filter { name="vpc-id" values=[local.vpc_id] } filter { name="tag:Tier" values=["private"] } }
  data "aws_secretsmanager_secret_version" "db" { secret_id = local.db_secret_arn }
Generate ONLY the NEW modules requested. Reference existing resources via data sources.
`:"";

  return {
    iac:{system:SYS,user:
`Generate complete production-ready ${f.iacTool} infrastructure for: ${f.appDescription||"web application"} on ${CN[f.cloud]}.
Deploy target: ${f.deployTarget||"default"}. Extras: ${f.extras.join(", ")||"none"}.
Region: ${f.region||"us-east-1"}${f.drRegion?`. DR region: ${f.drRegion}`:""}
${f.compliance?`Compliance: ${f.compliance.toUpperCase()}`:""}

${EI}EXACT NAMED RESOURCES (use these exact names as Terraform resource identifiers, tags, and all cross-module references):
${RS}

MICROSERVICES: ${SS}

═══════════════════════════════════════════════════════════════════
CRITICAL: PROPER MODULE OUTPUT CHAINING
Every module MUST export outputs. Root main.tf MUST wire modules together using those outputs.
NO hardcoded IDs anywhere — all cross-references must use module.X.output_name syntax.
═══════════════════════════════════════════════════════════════════

${f.iacTool==="terraform"||f.iacTool==="terragrunt"?`
REQUIRED OUTPUT → INPUT CHAIN (implement ALL of these):

networking module outputs → used by EVERY other module:
  - vpc_id, private_subnet_ids[], public_subnet_ids[]
  - nat_gateway_ids[], security_group_ids{alb,compute,db,cache,bastion}
  - availability_zones[]

compute module receives from networking:
  - var.vpc_id = module.networking.vpc_id
  - var.private_subnet_ids = module.networking.private_subnet_ids
  - var.alb_security_group_id = module.networking.security_group_ids["alb"]

${f.deployTarget==="ec2"?`
EC2-SPECIFIC CHAIN:
compute module outputs (for EC2 deploy):
  - instance_ids[], private_ips[], public_ips[] per named instance group
  - alb_dns_name, alb_arn, alb_zone_id (for DNS/Route53)
  - autoscaling_group_names{} per named ASG
  - launch_template_ids{}
  - target_group_arns{} — one per named service/port

ALB target group registration:
  - aws_lb_target_group named per service (e.g. "api-tg", "frontend-tg")
  - aws_lb_target_group_attachment uses module.compute.instance_ids
  - ALB listener rules route /api/* → api-tg, /* → frontend-tg

EC2 user_data bootstrap script (base64 encoded in launch template):
  - Pulls DB_HOST from SSM: aws ssm get-parameter --name /app/db_host
  - Pulls DB_PASSWORD from Secrets Manager by name: ${f.resources.filter(r=>r.serviceId==="secrets_mgr").map(r=>r.names[0]).join(", ")||"app-secrets"}
  - Exports env vars and starts application
  - Registers with ALB target group on startup

Files:
- terraform/modules/compute/main.tf (Launch Template + ASG per named group + ALB + Target Groups + Listener Rules)
- terraform/modules/compute/user_data.sh.tpl (bootstrap: install deps, fetch secrets from SSM/SecretsManager, start app)
- terraform/modules/compute/variables.tf (receives vpc_id, subnet_ids, sg_ids, db_host, db_port, secret_arns from other modules)
- terraform/modules/compute/outputs.tf (exports instance_ids, private_ips, alb_dns_name, target_group_arns)
`:f.deployTarget==="ecs"?`
ECS-SPECIFIC CHAIN:
compute module outputs (for ECS):
  - ecs_cluster_arns{} per named cluster
  - task_definition_arns{} per service
  - service_arns{} per named service
  - alb_dns_name, alb_arn — used by DNS module
  - ecr_repository_urls{} — consumed by pipeline

ECS task definition receives DB details via secrets:
  - secrets block references module.database.secret_arn
  - environment: DB_HOST = module.database.endpoint
  - environment: DB_PORT = module.database.port
`:f.deployTarget==="eks"?`
EKS-SPECIFIC CHAIN:
compute module outputs (for EKS):
  - cluster_endpoint, cluster_name, cluster_certificate_authority_data
  - node_group_arns{}, oidc_provider_arn (for IRSA)
  - kubeconfig_command (aws eks update-kubeconfig ...)

ExternalSecrets operator uses:
  - module.iam.external_secrets_role_arn (IRSA)
  - module.database.secret_name → SecretStore → ExternalSecret CR
`:""}

database module receives from networking, outputs to compute/secrets:
  - var.vpc_id = module.networking.vpc_id
  - var.subnet_ids = module.networking.private_subnet_ids
  - var.security_group_id = module.networking.security_group_ids["db"]
  Outputs:
  - endpoint (hostname only, no port) → stored in SSM + Secrets Manager
  - port, database_name, username
  - secret_arn (Secrets Manager ARN containing full connection string)
  - replica_endpoints[] (if multi-AZ)
  Parameter store writes (in locals or null_resource):
    - /\${var.app_name}/\${var.env}/db/host = aws_db_instance.this.address
    - /\${var.app_name}/\${var.env}/db/port = aws_db_instance.this.port

storage module receives from networking:
  - var.vpc_id for VPC endpoint policies
  Outputs:
  - bucket_arns{} per named bucket — used by IAM module for policies
  - bucket_names{} per named bucket

iam module receives outputs from ALL other modules:
  - var.bucket_arns = module.storage.bucket_arns
  - var.cluster_oidc = module.compute.oidc_provider_arn (EKS only)
  - var.secret_arns = module.database.secret_arn
  Outputs:
  - role_arns{} per service — used in task definitions / K8s ServiceAccounts

ROOT main.tf MUST follow this exact dependency order:
  module "networking" { ... }
  module "storage"    { depends_on = [module.networking]; vpc_id = module.networking.vpc_id }
  module "database"   { depends_on = [module.networking]; vpc_id = module.networking.vpc_id; subnet_ids = module.networking.private_subnet_ids; security_group_id = module.networking.security_group_ids["db"] }
  module "iam"        { depends_on = [module.storage, module.database]; bucket_arns = module.storage.bucket_arns; secret_arns = module.database.secret_arn }
  module "compute"    { depends_on = [module.networking, module.database, module.iam]; vpc_id = module.networking.vpc_id; subnet_ids = module.networking.private_subnet_ids; db_host = module.database.endpoint; db_secret_arn = module.database.secret_arn; instance_role_arn = module.iam.role_arns["app"] }

ROOT outputs.tf MUST export a complete reference sheet:
  # Infrastructure reference outputs — use these to extend this stack later
  output "vpc_id"              { value = module.networking.vpc_id }
  output "private_subnet_ids"  { value = module.networking.private_subnet_ids }
  output "public_subnet_ids"   { value = module.networking.public_subnet_ids }
  output "security_groups"     { value = module.networking.security_group_ids }
  output "db_endpoint"         { value = module.database.endpoint; sensitive = true }
  output "db_secret_arn"       { value = module.database.secret_arn }
  output "bucket_arns"         { value = module.storage.bucket_arns }
  output "iam_role_arns"       { value = module.iam.role_arns }
  ${f.deployTarget==="ec2"?`output \"alb_dns_name\"  { value = module.compute.alb_dns_name }`:f.deployTarget==="eks"?`output \"cluster_name\" { value = module.compute.cluster_name }\n  output \"cluster_endpoint\" { value = module.compute.cluster_endpoint }`:`output \"service_arns\" { value = module.compute.service_arns }`}

EXTENDING THIS STACK (future additions):
Add a comment block at the top of outputs.tf:
  # To add API Gateway referencing this VPC:
  #   data "terraform_remote_state" "base" { backend = "s3"; config = { bucket = "...", key = "terraform.tfstate" } }
  #   resource "aws_api_gateway_vpc_link" { target_arns = [data.terraform_remote_state.base.outputs.alb_arn] }
  # To add RDS read replica: set source = module.database.db_instance_id
  # To add ElastiCache: use private_subnet_ids + security_group_ids["cache"] from this stack's outputs

GENERATED FILES:
- terraform/Makefile (init/validate/plan/apply/destroy + output targets: make show-outputs, make db-endpoint)
- terraform/scripts/validate.sh (fmt-check + validate + tflint)
- terraform/backend.tf (S3 + DynamoDB remote state with workspace support)
- terraform/main.tf (calls ALL modules with EXACT output→variable wiring as above)
- terraform/variables.tf (app_name, env, region, dr_region)
- terraform/outputs.tf (complete reference sheet as above)
- terraform/modules/networking/main.tf + variables.tf + outputs.tf
- terraform/modules/compute/main.tf + variables.tf + outputs.tf${f.deployTarget==="ec2"?" + user_data.sh.tpl":""}
- terraform/modules/database/main.tf + variables.tf + outputs.tf (writes to SSM Parameter Store)
- terraform/modules/storage/main.tf + variables.tf + outputs.tf
- terraform/modules/iam/main.tf + variables.tf + outputs.tf
- terraform/modules/security/main.tf + variables.tf + outputs.tf (KMS, WAF, GuardDuty if selected)
- terraform/smoke-tests/smoke_test.sh (curl each named ALB/endpoint using terraform output -raw alb_dns_name)
`:f.iacTool==="cloudformation"?`
CloudFormation cross-stack references:
  - networking stack exports: VpcId, PrivateSubnet1, PrivateSubnet2, DBSecurityGroup, ComputeSecurityGroup
  - database stack imports via !ImportValue and exports: DBEndpoint, DBSecretArn
  - compute stack imports VpcId, SubnetsIds, DBEndpoint from above stacks
  Outputs section in each template exports all key values for cross-stack reference.
Files: cloudformation/templates/(network,compute,database,storage,iam,monitoring).yaml
  master.yaml (nested stack with DependsOn ordering)
  parameters/dev.json + prod.json
`:f.iacTool==="bicep"?`
Bicep module output chaining:
  - networking.bicep outputs: vnetId, privateSubnetIds, publicSubnetIds, nsgIds
  - database.bicep receives vnetId + subnetId, outputs: serverFqdn, connectionStringSecretUri
  - compute.bicep receives vnetId, subnetIds, dbConnectionSecret, outputs: appFqdn, managedIdentityId
  main.bicep wires all modules with explicit output→param passing.
Files: bicep/main.bicep, bicep/modules/(networking,compute,database,storage,keyvault,identity).bicep
  bicep/parameters/dev.bicepparam + prod.bicepparam
`:f.iacTool==="pulumi"?`
Pulumi stack references:
  - Create base stack (networking) first, export vpc.id, subnet ids
  - Database stack: const baseStack = new pulumi.StackReference("base"); const vpcId = baseStack.getOutput("vpcId")
  - Compute stack references both networking and database stack outputs
  index.ts wires all resources with proper Output<T> chaining.
Files: pulumi/index.ts, pulumi/networking.ts, pulumi/database.ts, pulumi/compute.ts
  Pulumi.dev.yaml + Pulumi.prod.yaml
`:""}

All resources named exactly as specified. Detailed inline comments explaining every cross-module reference. Syntactically valid.`
    },

    pipeline:{system:SYS,user:
`Generate TWO ${PN[f.pipeline]} pipelines (frontend + backend) for: ${f.appDescription||"web application"} on ${CN[f.cloud]}.
Named resources: ${RS}
Microservices: ${SS}

File prefixes: "# File: pipelines/frontend/..." and "# File: pipelines/backend/..."
Also: "# File: pipelines/smoke-tests/smoke_test.sh" and "# File: pipelines/smoke-tests/health_check.sh"

${f.pipeline==="github"?`- pipelines/frontend/.github/workflows/frontend-deploy.yml
- pipelines/backend/.github/workflows/backend-deploy.yml`:
f.pipeline==="gitlab"?`- pipelines/frontend/.gitlab-ci-frontend.yml\n- pipelines/backend/.gitlab-ci-backend.yml`:
f.pipeline==="azure_devops"?`- pipelines/frontend/azure-pipelines-frontend.yml (pool: ubuntu-latest, stages: build→test→scan→push→deploy)\n- pipelines/backend/azure-pipelines-backend.yml (+ DB migration task before deploy)\n- pipelines/azure-library-variables.md (variable group setup guide)`:
f.pipeline==="jenkins"?`- pipelines/frontend/Jenkinsfile.frontend\n- pipelines/backend/Jenkinsfile.backend`:
f.pipeline==="bitbucket"?`- pipelines/frontend/bitbucket-pipelines-frontend.yml\n- pipelines/backend/bitbucket-pipelines-backend.yml`:
`- pipelines/frontend/buildspec-frontend.yml + codepipeline-frontend.json\n- pipelines/backend/buildspec-backend.yml + codepipeline-backend.json`}

Each pipeline stages:
1. Checkout — set IMAGE_TAG=$GIT_SHA
2. Install deps + lint (frontend: ESLint + TypeScript; backend: language linter)
3. Unit tests + coverage (fail below 80%)
4. Trivy filesystem scan (fail on CRITICAL)
5. Build Docker multi-stage image with layer caching
6. Push to ${registry}
7. Trivy image scan (fail on CRITICAL)
8. Deploy: ${deployStep}
9. SMOKE TESTS: run health_check.sh against ${f.resources.filter(r=>r.serviceId==="alb"||r.serviceId==="nlb").map(r=>r.names.join(", ")).join(", ")||"service endpoints"} — retry 5× with 15s delay
10. BACKEND ONLY: run DB migration BEFORE deploy
11. FRONTEND ONLY: Lighthouse CI score ≥80, CDN cache invalidation
12. Auto-rollback on failure
13. Slack notification (status + image tag + smoke test result)

Separate dev (auto on develop branch) vs prod (manual approval on main).`
    },

    stack:{system:SYS,user:
`Generate application stack for: ${f.appDescription||"web application"} on ${CN[f.cloud]}.
Deploy: ${f.deployTarget||"container"} ${isHelm?"(Helm)":isEC2Like?"(EC2 + systemd/Docker Compose on instances)":""}. Microservices: ${SS}

Required files:
- Dockerfile.frontend (multi-stage: node build → nginx, non-root, HEALTHCHECK)
- Dockerfile.backend  (multi-stage, non-root, HEALTHCHECK)
- docker-compose.yml  (${f.microservices.length?f.microservices.map(s=>s.name).join(" + "):"frontend + backend"} + postgres + redis, healthchecks, hot reload)

${isHelm?`Helm chart (prefix "# File: helm/app/"):
- helm/app/Chart.yaml + values.yaml + values-dev.yaml + values-prod.yaml + helmfile.yaml
- helm/app/templates/NOTES.txt + _helpers.tpl + namespace.yaml
- helm/app/templates/deployment-frontend.yaml + deployment-backend.yaml
${f.microservices.map(s=>`- helm/app/templates/deployment-${s.name}.yaml`).join("\n")}
- helm/app/templates/service-frontend.yaml + service-backend.yaml
- helm/app/templates/ingress.yaml (/ → frontend, /api → backend${f.microservices.length?", "+f.microservices.map(s=>`/${s.name} → ${s.name}`).join(", "):""})
- helm/app/templates/hpa-frontend.yaml + hpa-backend.yaml
- helm/app/templates/configmap.yaml + secret.yaml + poddisruptionbudget.yaml
- helm/app/templates/serviceaccount.yaml + rbac.yaml
- helm/app/smoke-tests/smoke_test.yaml (Helm test pod)`:isEC2Like?`EC2/VM deployment files (prefix "# File: app/"):
- app/scripts/deploy.sh (rolling deploy: pull from S3/ECR → stop old → start new → ALB health check)
- app/scripts/bootstrap.sh (EC2 user_data: install runtime, fetch secrets from SSM/SecretsManager, start app)
- app/scripts/health_check.sh (curl /health on each service port — used by ALB target group)
- app/systemd/frontend.service (systemd unit: ExecStart, Restart=always, EnvironmentFile)
- app/systemd/backend.service (systemd unit per microservice)
- app/docker-compose.prod.yml (alternative: run all services via Docker Compose on instance)
- app/nginx/nginx.conf (reverse proxy: upstream blocks per named service, rate limiting, gzip)
- app/nginx/sites/app.conf (server block: proxy_pass to each service port, health endpoint)
- app/scripts/rollback.sh (revert to previous artifact version, restart services, verify health)`:`K8s manifests (prefix "# File: k8s/"):
- k8s/namespace.yaml
- k8s/deployment-frontend.yaml + deployment-backend.yaml
${f.microservices.map(s=>`- k8s/deployment-${s.name}.yaml`).join("\n")}
- k8s/service-frontend.yaml + service-backend.yaml
- k8s/ingress.yaml (nginx, cert-manager, path routing)
- k8s/hpa-frontend.yaml + hpa-backend.yaml
- k8s/configmap.yaml + secret.yaml + poddisruptionbudget-frontend.yaml + poddisruptionbudget-backend.yaml
- k8s/smoke-tests/smoke_test.sh`}
Inline comments throughout.`
    },

    security:{system:SYS,user:
`Generate security baseline for: ${f.appDescription||"web app"} on ${CN[f.cloud]}.
Named resources: ${RS}

Files prefixed "# File: security/":
- security/iam-policy.json (least-privilege for each named service, explicit Deny all else)
- security/security-groups.md (table per SG: ALB/compute/DB/cache — ingress + egress + justification)
- security/secrets-setup.sh (create + retrieve all secrets via ${f.cloud==="aws"?"AWS Secrets Manager":f.cloud==="azure"?"Azure Key Vault":"GCP Secret Manager"})
- security/network-acls.md (subnet-level rules, port/protocol, business justification)
- security/kms-setup.sh (${f.resources.filter(r=>r.serviceId==="kms").map(r=>r.names.join(", ")).join(", ")||"encryption key"} — key policy + usage)
- security/cis-checklist.md (top 20 CIS controls: ✅ pass / ⬜ action-needed + exact remediation)
- security/soc2-mappings.md (CC6/CC7/CC8 mapped to named components + evidence)
- security/hardening-checklist.md (OS, container, network hardening with exact commands)`
    },

    config:{system:SYS,user:
`Generate ${f.configTool||"Ansible"} configuration management playbooks for: ${f.appDescription||"web application"} on ${CN[f.cloud]}.
Target hosts: ${f.resources.filter(r=>["ec2","vm","compute_engine"].includes(r.serviceId)).map(r=>r.names.join(", ")).join(", ")||"application servers"}
Software to configure: ${Object.values(f.configPresets||[]).join(", ")||"base system hardening"}

${f.configTool==="ansible"||!f.configTool?`Files prefixed "# File: ansible/":
- ansible/ansible.cfg (roles_path, inventory, retry_files, timeout, SSH args)
- ansible/requirements.yml (Ansible Galaxy roles for: ${(f.configPresets||[]).join(", ")||"common"})
- ansible/inventory/dev.ini (host groups: webservers, dbservers, all)
- ansible/inventory/prod.ini
- ansible/group_vars/all.yml (common vars: app_user, deploy_dir, log_dir)
- ansible/group_vars/dev.yml + prod.yml
- ansible/playbooks/site.yml (master playbook: imports all role plays)
- ansible/playbooks/bootstrap.yml (first-run: update OS, install base packages, set hostname, configure swap, NTP, users)
${(f.configPresets||[]).filter(p=>["nginx","apache","haproxy","caddy","traefik","varnish"].includes(p)).length?"\n- ansible/playbooks/webserver.yml":""}
${(f.configPresets||[]).filter(p=>["mysql_svc","pg_svc","redis_svc","mongodb_s","elastic","rabbit","kafka_svc","cassandra","mariadb"].includes(p)).length?"\n- ansible/playbooks/database.yml":""}
${(f.configPresets||[]).filter(p=>["docker","compose","containerd","podman"].includes(p)).length?"\n- ansible/playbooks/containers.yml":""}
${(f.configPresets||[]).filter(p=>["node_exp","grafana","prometheus","alertmanager","datadog","otel","zabbix"].includes(p)).length?"\n- ansible/playbooks/monitoring.yml":""}
${(f.configPresets||[]).filter(p=>["certbot","fail2ban","ufw","iptables","ssh_hard","sysctl_h","selinux","apparmor","wazuh","aide","crowdsec"].includes(p)).length?"\n- ansible/playbooks/security-hardening.yml":""}
${(f.configPresets||[]).filter(p=>["celery","sidekiq","kafka_svc","resque"].includes(p)).length?"\n- ansible/playbooks/message-queues.yml":""}
${(f.configPresets||[]).filter(p=>["keepalived","wireguard","openvpn","bind9","postfix"].includes(p)).length?"\n- ansible/playbooks/networking.yml":""}
${(f.configPresets||[]).filter(p=>["pgbouncer","nginx_cache","bbr","hugepages"].includes(p)).length?"\n- ansible/playbooks/performance.yml":""}
For EACH software preset (${(f.configPresets||[]).join(", ")||"common"}), generate a full Ansible role:
- ansible/roles/<name>/tasks/main.yml (install + configure + verify)
- ansible/roles/<name>/handlers/main.yml (restart service on config change)
- ansible/roles/<name>/defaults/main.yml (all configurable variables with defaults)
- ansible/roles/<name>/templates/<name>.conf.j2 (Jinja2 config template)
- ansible/roles/<name>/files/<name>-init.sh (if needed)
- ansible/roles/<name>/meta/main.yml (dependencies)
Each role: idempotent, supports --check mode, handles both Debian/RHEL, uses systemd.`:
f.configTool==="puppet"?`Files prefixed "# File: puppet/":
- puppet/Puppetfile (Forge modules for: ${(f.configPresets||[]).join(", ")||"common"})
- puppet/hiera.yaml (hierarchy: nodes → environment → common)
- puppet/manifests/site.pp (node classification)
- puppet/data/common.yaml + dev.yaml + prod.yaml (Hiera data)
For EACH preset, generate a Puppet profile:
- puppet/modules/profile/manifests/<name>.pp (declare resources idempotently)
- puppet/modules/profile/templates/<name>.conf.epp (EPP config template)
- puppet/modules/profile/files/<name>/ (static files)
- puppet/modules/role/manifests/app_server.pp (composes profiles)`:
f.configTool==="chef"?`Files prefixed "# File: chef/":
- chef/Berksfile (cookbook dependencies)
- chef/metadata.rb
- chef/attributes/default.rb (configurable attributes)
For EACH preset, generate a Chef recipe:
- chef/recipes/<name>.rb (resource declarations)
- chef/templates/<name>/<name>.conf.erb (ERB config template)
- chef/spec/unit/recipes/<name>_spec.rb (ChefSpec tests)
- chef/kitchen.yml (Test Kitchen config for CI testing)`:
`Files prefixed "# File: salt/":
- salt/top.sls (environment to minion mapping)
- salt/pillar/top.sls
- salt/pillar/data.sls (sensitive variables)
For EACH preset generate a Salt state:
- salt/states/<name>/init.sls (pkg.installed + service.running + file.managed)
- salt/states/<name>/files/<name>.conf (config file)
- salt/grains/<name>.sls (grain-based targeting)
- salt/Saltfile + salt/master + salt/minion (config files)`}

Every config file should be production-ready, idempotent, and include comments explaining each option.`
    },

    runbook:{system:"You are a senior SRE. Write detailed operational docs with exact CLI commands. Output as '# File: docs/runbook.md'.",user:
`Write complete operational docs for: ${f.appDescription||"web application"}
Cloud: ${CN[f.cloud]} | Pipeline: ${PN[f.pipeline]} | IaC: ${f.iacTool} | Deploy: ${f.deployTarget||"default"}
Named resources: ${RS}
Microservices: ${SS}
Config Mgmt: ${f.configTool||"none"} — ${(f.configPresets||[]).join(", ")||"n/a"}

Output as: # File: docs/runbook.md

## Deployment Guide
Prerequisites + first-time setup + step-by-step deploy commands for all named resources.

## Architecture Overview
ASCII diagram showing all named resources, data flows, and microservice routing.

## Smoke Test Runbook
For each named endpoint: exact curl commands, expected status codes, what to do on failure.

## Day-2 Operations
Commands: scale each named cluster, rolling deploy, emergency rollback, rotate DB credentials, resize each named DB.

## Config Management
How to run ${f.configTool||"Ansible"} against each named host group. Check mode. Rollback.

## Incident Response Playbook
For each — detection → diagnosis → resolution → escalation:
- Service down (named ALB/LB), Named DB errors, Named cache failure, High CPU, Pipeline failure, Security alert

## Monthly Cost Estimate
Dev vs prod table per named resource on ${CN[f.cloud]}.

## Disaster Recovery Plan
RTO/RPO targets, per-resource backup schedule, failover steps.`
    },

    secrets:{system:SYS,user:
`Generate complete secrets & environment management for: ${f.appDescription||"web app"} on ${CN[f.cloud]}.
Named resources: ${RS}. Microservices: ${SS}
${f.compliance?`Compliance: ${f.compliance.toUpperCase()} controls applied`:""}
Files prefixed "# File: secrets/":
- secrets/.env.example (ALL required env vars with descriptions, no real values)
- secrets/.env.development (safe dev defaults, mock credentials)
- secrets/vault/vault-config.hcl (HashiCorp Vault: TLS, storage backend, audit log)
- secrets/vault/policies/app-policy.hcl (least-privilege Vault policies per microservice)
- secrets/vault/init-secrets.sh (write all initial secrets to Vault paths)
- secrets/external-secrets/secret-store.yaml (ClusterSecretStore for ${f.cloud==="aws"?"AWS Secrets Manager":f.cloud==="azure"?"Azure Key Vault":"GCP Secret Manager"})
- secrets/external-secrets/app-external-secret.yaml (ExternalSecret per service)
- secrets/rotation/rotate-db-credentials.sh (automated DB cred rotation, zero-downtime, rollback)
- secrets/rotation/rotate-app-secrets.sh (manual app secret rotation runbook)
- secrets/audit/secrets-audit.sh (list secrets, last-accessed dates, rotation status)
- secrets/sealed-secrets/sealed-secret.yaml (Bitnami SealedSecret for GitOps workflows)
Comments on every field. Production-ready.`
    },

    observability:{system:SYS,user:
`Generate complete observability stack for: ${f.appDescription||"web app"} on ${CN[f.cloud]}.
Deploy: ${f.deployTarget||"container"}. Resources: ${RS}. Services: ${SS}
Files prefixed "# File: observability/":
- observability/docker-compose-monitoring.yml (Prometheus + Grafana + Loki + Jaeger + OTel Collector, volumes, networks, healthchecks)
- observability/prometheus/prometheus.yml (scrape configs per named service, ${CN[f.cloud]} exporters, 30d retention)
- observability/prometheus/alert_rules.yml (CPU>80%, memory>85%, error_rate>1%, p99>500ms, disk>90% per named service)
- observability/grafana/provisioning/datasources.yml (Prometheus + Loki + Jaeger + ${CN[f.cloud]} native monitoring)
- observability/grafana/provisioning/dashboards.yml (dashboard loader config)
- observability/grafana/dashboards/application.json (requests/s, error rate, p50/p95/p99 latency per microservice)
- observability/grafana/dashboards/infrastructure.json (CPU, memory, disk, network I/O per named resource)
- observability/grafana/dashboards/slo-dashboard.json (error budget, burn rate, SLO/SLA compliance)
- observability/loki/loki-config.yml (log storage backend, retention rules, compactor)
- observability/promtail/promtail-config.yml (scrape + label logs from each named service)
- observability/otel/otel-collector-config.yml (OTLP gRPC+HTTP receivers, batch processor, Prometheus+Loki+Jaeger exporters)
- observability/jaeger/jaeger-config.yml (all-in-one or distributed: collector + query + storage)
${["eks","aks","gke"].includes(f.deployTarget)?`- observability/k8s/kube-prometheus-stack-values.yaml (Helm values for kube-prometheus-stack)
- observability/k8s/servicemonitor.yaml (ServiceMonitor per named service)
- observability/k8s/podmonitor.yaml (PodMonitor for batch/worker pods)
- observability/k8s/loki-stack-values.yaml (Loki + Promtail Helm values)`:""}
- observability/scripts/setup-dashboards.sh (import all JSON dashboards via Grafana API with curl)
- observability/scripts/test-alerts.sh (fire test alerts to verify full alerting pipeline end-to-end)
Production-ready, detailed comments, exact service names throughout.`
    },
  };
};

// ─── ServiceBadge component ───────────────────────────────────────────────
function ServiceBadge({abbr,cat,cloud,size=26}){
  const bg=(CAT_BG[cloud]||CAT_BG.aws)[cat]||"#475569";
  const fs=abbr.length>3?Math.max(7,size*0.26):Math.max(8,size*0.3);
  return <div style={{width:size,height:size,background:bg,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"JetBrains Mono",fontWeight:700,color:"#fff",fontSize:fs,letterSpacing:abbr.length>3?"-0.5px":"0"}}>{abbr}</div>;
}

// ─── FileTree ─────────────────────────────────────────────────────────────
function FileTree({tree,selectedPath,onSelect,depth=0}){
  const [open,setOpen]=useState({});
  const entries=Object.entries(tree).sort(([,a],[,b])=>{if(a.__file&&!b.__file)return 1;if(!a.__file&&b.__file)return -1;return 0;});
  return <div>{entries.map(([name,node])=>{
    if(node.__file){const active=selectedPath===node.path;return <div key={name} onClick={()=>onSelect(node)} style={{display:"flex",alignItems:"center",gap:5,padding:`3px 6px 3px ${8+depth*13}px`,cursor:"pointer",borderRadius:4,marginBottom:1,background:active?"#0f2944":"transparent",color:active?"#38bdf8":"#94a3b8",fontSize:11,fontFamily:"JetBrains Mono",borderLeft:active?"2px solid #38bdf8":"2px solid transparent"}}><span style={{fontSize:10}}>{fileIcon(name)}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span></div>;}
    const isOpen=open[name]!==false;
    return <div key={name}><div onClick={()=>setOpen(o=>({...o,[name]:!isOpen}))} style={{display:"flex",alignItems:"center",gap:5,padding:`3px 6px 3px ${8+depth*13}px`,cursor:"pointer",color:"#7dd3fc",fontSize:11,fontFamily:"JetBrains Mono",fontWeight:600,userSelect:"none"}}><span style={{fontSize:9,color:"#475569",minWidth:9}}>{isOpen?"▾":"▸"}</span><span>📁</span><span>{name}</span></div>{isOpen&&<FileTree tree={node} selectedPath={selectedPath} onSelect={onSelect} depth={depth+1}/>}</div>;
  })}</div>;
}

// ─── ResourceBuilder ──────────────────────────────────────────────────────
function ResourceBuilder({cloud,resources,onChange}){
  const [search,setSearch]=useState("");
  const [activeCat,setActiveCat]=useState("All");
  if(!cloud)return <div style={{color:"#475569",fontFamily:"JetBrains Mono",fontSize:12,padding:20,textAlign:"center"}}>Select a cloud provider in Step 1 first.</div>;
  const catalog=SC[cloud]||{};
  const cats=["All",...Object.keys(catalog)];
  const selectedIds=resources.map(r=>r.serviceId);

  const filtered=Object.entries(catalog).flatMap(([cat,svcs])=>
    (activeCat==="All"||activeCat===cat)?svcs.filter(s=>!search||s.label.toLowerCase().includes(search.toLowerCase())||s.abbr.toLowerCase().includes(search.toLowerCase())||s.desc.toLowerCase().includes(search.toLowerCase())).map(s=>({...s,cat})):[]
  );

  const add=svc=>{if(selectedIds.includes(svc.id))return;onChange([...resources,{serviceId:svc.id,label:svc.label,abbr:svc.abbr,cat:svc.cat,count:1,names:[svc.id.replace(/_/g,"-")+"-1"]}]);};
  const rem=id=>onChange(resources.filter(r=>r.serviceId!==id));
  const setCount=(id,c)=>{const n=Math.max(1,Math.min(8,c));onChange(resources.map(r=>{if(r.serviceId!==id)return r;const names=Array.from({length:n},(_,i)=>r.names[i]||(r.names[0]?.replace(/-\d+$/,"")||"svc")+"-"+(i+1));return{...r,count:n,names};}));};
  const setName=(id,idx,val)=>onChange(resources.map(r=>{if(r.serviceId!==id)return r;const names=[...r.names];names[idx]=val;return{...r,names};}));

  return <div>
    {/* Search + category filter */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search services..." style={{flex:1,minWidth:180,padding:"7px 11px",background:"#060d1a",border:"1px solid #1e3a5f",borderRadius:7,color:"#e2e8f0",fontFamily:"JetBrains Mono",fontSize:12,outline:"none"}}/>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {cats.map(c=><button key={c} onClick={()=>setActiveCat(c)} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${activeCat===c?"#38bdf8":"#1e3a5f"}`,background:activeCat===c?"#0f2944":"transparent",color:activeCat===c?"#38bdf8":"#64748b",fontSize:10,fontFamily:"JetBrains Mono",cursor:"pointer"}}>{c}</button>)}
      </div>
    </div>

    {/* Service grid */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:6,marginBottom:16,maxHeight:320,overflowY:"auto",paddingRight:4}}>
      {filtered.map(svc=>{const sel=selectedIds.includes(svc.id);return(
        <div key={svc.id} onClick={()=>sel?rem(svc.id):add(svc)} style={{padding:"8px 10px",border:`1px solid ${sel?"#38bdf8":"#1e3a5f"}`,borderRadius:8,cursor:"pointer",background:sel?"#0f2944":"#060d1a",display:"flex",alignItems:"center",gap:8,transition:"all .15s",position:"relative"}}>
          <ServiceBadge abbr={svc.abbr} cat={svc.cat} cloud={cloud} size={28}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,color:sel?"#38bdf8":"#94a3b8",fontFamily:"JetBrains Mono",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{svc.label}</div>
            <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{svc.desc}</div>
          </div>
          {sel&&<span style={{position:"absolute",top:4,right:6,color:"#38bdf8",fontSize:10}}>✓</span>}
        </div>
      );})}
      {filtered.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",color:"#475569",fontFamily:"JetBrains Mono",fontSize:12,padding:"24px 0"}}>No services match "{search}"</div>}
    </div>

    {/* Named resource editor */}
    {resources.length>0&&<div style={{background:"#060d1a",border:"1px solid #1e4a7a",borderRadius:11,padding:16}}>
      <div style={{fontSize:11,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:12}}>✏️ NAME YOUR RESOURCES</div>
      {resources.map(r=><div key={r.serviceId} style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #1e3a5f"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <ServiceBadge abbr={r.abbr} cat={r.cat} cloud={cloud} size={24}/>
            <span style={{fontWeight:700,color:"#e2e8f0",fontSize:12,fontFamily:"JetBrains Mono"}}>{r.label}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono"}}>×</span>
            <button onClick={()=>setCount(r.serviceId,r.count-1)} style={{width:20,height:20,borderRadius:4,background:"#1e3a5f",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,lineHeight:1}}>−</button>
            <span style={{fontFamily:"JetBrains Mono",fontSize:13,color:"#38bdf8",minWidth:18,textAlign:"center"}}>{r.count}</span>
            <button onClick={()=>setCount(r.serviceId,r.count+1)} style={{width:20,height:20,borderRadius:4,background:"#1e3a5f",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,lineHeight:1}}>+</button>
            <button onClick={()=>rem(r.serviceId)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,marginLeft:4}}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {r.names.map((name,idx)=><div key={idx} style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono"}}>#{idx+1}</span>
            <input value={name} onChange={e=>setName(r.serviceId,idx,e.target.value)} style={{background:"#0a1628",border:"1px solid #1e3a5f",color:"#38bdf8",borderRadius:5,padding:"4px 9px",fontFamily:"JetBrains Mono",fontSize:12,width:150,outline:"none"}} onFocus={e=>e.target.style.borderColor="#38bdf8"} onBlur={e=>e.target.style.borderColor="#1e3a5f"}/>
          </div>)}
        </div>
      </div>)}
    </div>}
  </div>;
}

// ─── MicroserviceBuilder ──────────────────────────────────────────────────
function MicroserviceBuilder({services,onChange}){
  const add=()=>onChange([...services,{name:"service-"+(services.length+1),port:3000+services.length}]);
  const rem=i=>onChange(services.filter((_,j)=>j!==i));
  const upd=(i,field,val)=>onChange(services.map((s,j)=>j===i?{...s,[field]:val}:s));
  return <div>
    {services.map((s,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
      <span style={{fontSize:16}}>⚙️</span>
      <input value={s.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="service-name" style={{flex:1,background:"#060d1a",border:"1px solid #1e3a5f",color:"#38bdf8",borderRadius:6,padding:"6px 10px",fontFamily:"JetBrains Mono",fontSize:12,outline:"none"}}/>
      <span style={{fontSize:11,color:"#475569",fontFamily:"JetBrains Mono"}}>port:</span>
      <input value={s.port} onChange={e=>upd(i,"port",e.target.value)} type="number" style={{width:72,background:"#060d1a",border:"1px solid #1e3a5f",color:"#38bdf8",borderRadius:6,padding:"6px 8px",fontFamily:"JetBrains Mono",fontSize:12,outline:"none"}}/>
      <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13}}>✕</button>
    </div>)}
    <button onClick={add} style={{background:"#0a1628",border:"1px dashed #1e4a7a",color:"#38bdf8",borderRadius:7,padding:"7px 16px",fontFamily:"JetBrains Mono",fontSize:12,cursor:"pointer",width:"100%",marginTop:4}}>+ Add microservice</button>
  </div>;
}

// ─── ConfigMgmtBuilder ────────────────────────────────────────────────────
function ConfigMgmtBuilder({configTool,configPresets,onChange}){
  const cats=Object.keys(CONFIG_PRESETS);
  const toggle=id=>{const on=configPresets.includes(id);onChange({configTool,configPresets:on?configPresets.filter(p=>p!==id):[...configPresets,id]});};
  return <div>
    <div style={{display:"flex",gap:9,flexWrap:"wrap",marginBottom:16}}>
      {[{id:"",label:"None",icon:"—",desc:"Skip config mgmt"},...CONFIG_TOOLS].map(t=>(
        <div key={t.id} onClick={()=>onChange({configTool:t.id,configPresets})} style={{padding:"9px 14px",border:`1px solid ${configTool===t.id?"#38bdf8":"#1e3a5f"}`,borderRadius:8,cursor:"pointer",background:configTool===t.id?"#0f2944":"transparent",minWidth:110,textAlign:"center"}}>
          <div style={{fontSize:18,marginBottom:2}}>{t.icon}</div>
          <div style={{fontWeight:600,color:configTool===t.id?"#38bdf8":"#94a3b8",fontSize:12,fontFamily:"JetBrains Mono"}}>{t.label}</div>
          <div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",marginTop:2}}>{t.desc}</div>
        </div>
      ))}
    </div>
    {configTool&&<div>
      <div style={{fontSize:11,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:12}}>SOFTWARE TO CONFIGURE</div>
      {cats.map(cat=><div key={cat} style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:7}}>{cat.toUpperCase()}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {CONFIG_PRESETS[cat].map(p=>{const on=configPresets.includes(p.id);return(
            <div key={p.id} onClick={()=>toggle(p.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",border:`1px solid ${on?"#38bdf8":"#1e3a5f"}`,borderRadius:20,cursor:"pointer",background:on?"#0f2944":"transparent"}}>
              <span style={{fontSize:13}}>{p.icon}</span>
              <span style={{fontSize:11,fontFamily:"JetBrains Mono",color:on?"#38bdf8":"#94a3b8",fontWeight:on?600:400}}>{p.label}</span>
              {on&&<span style={{fontSize:9,color:"#38bdf8"}}>✓</span>}
            </div>
          );})}
        </div>
      </div>)}
    </div>}
  </div>;
}

// ─── Tier map: service ID → diagram tier ─────────────────────────────────
const TIER_MAP={
  // Tier 1 – Edge / CDN / DNS
  cloudfront:1,route53:1,api_gw_rest:1,api_gw_http:1,api_gw_ws:1,
  front_door:1,cloud_cdn:1,azure_cdn:1,cloud_dns:1,azure_dns:1,traffic_mgr:1,
  global_acc:1,waf:1,cloud_armor:1,iap:1,ddos_prot:1,appsync:1,
  // Tier 2 – Load Balancers + NAT
  alb:2,nlb:2,app_gateway:2,azure_lb:2,http_lb:2,tcp_lb:2,
  nat_gateway:2,azure_nat:2,cloud_nat:2,az_firewall:2,
  // Tier 3 – Compute
  eks_cluster:3,ecs_cluster:3,fargate:3,ec2:3,ec2_asg:3,lambda:3,app_runner:3,beanstalk:3,batch:3,lightsail:3,outposts:3,
  aks_cluster:3,app_service:3,container_apps:3,spring_apps:3,vm:3,vmss:3,az_batch:3,service_fabric:3,
  gke_cluster:3,cloud_run:3,app_engine:3,gce_mig:3,compute_engine:3,cloud_batch_g:3,
  // Tier 4 – Database / Cache
  rds_postgres:4,rds_mysql:4,rds_mariadb:4,rds_sqlserver:4,aurora_pg:4,aurora_mysql:4,
  dynamodb:4,elasticache_r:4,elasticache_m:4,documentdb:4,neptune:4,timestream:4,keyspaces:4,memorydb:4,
  cosmos_db:4,pg_flexible:4,mysql_flex:4,redis_cache:4,azure_sql:4,sql_mi:4,synapse:4,az_search:4,
  cloud_sql_pg:4,cloud_sql_my:4,cloud_spanner:4,firestore:4,bigtable:4,memorystore_r:4,alloydb:4,bigquery:4,
  data_factory:4,
  // Tier 5 – Storage + Messaging
  s3:5,efs:5,ebs:5,fsx_windows:5,fsx_lustre:5,glacier:5,storage_gw:5,aws_backup:5,
  blob_storage:5,azure_files:5,table_storage:5,queue_az:5,data_lake:5,az_backup:5,
  gcs_bucket:5,filestore:5,persistent_d:5,gcp_backup:5,
  sqs:5,sns:5,eventbridge:5,kinesis_str:5,kinesis_fh:5,kinesis_an:5,msk:5,mq:5,step_fn:5,
  service_bus:5,event_hubs:5,event_grid:5,logic_apps:5,notif_hubs:5,
  pubsub:5,cloud_tasks:5,cloud_sched:5,eventarc:5,workflows:5,dataflow:5,
  // Tier 6 – Security + Monitoring + DevOps
  kms:6,secrets_mgr:6,waf:6,shield:6,guard_duty:6,security_hub:6,acm:6,inspector:6,macie:6,cognito:6,
  cloudwatch:6,cloudtrail:6,xray:6,ssm:6,config_svc:6,ecr:6,codebuild:6,codedeploy:6,
  key_vault:6,entra_id:6,defender:6,sentinel:6,managed_hsm:6,az_monitor:6,app_insights:6,log_analytics:6,net_watcher:6,
  secret_mgr:6,cloud_kms:6,cloud_id:6,artifact_reg:6,binary_auth:6,cloud_mon:6,cloud_log:6,cloud_trace:6,error_rep:6,
  redshift:6,athena:6,glue:6,emr:6,opensearch:6,quicksight:6,
  sagemaker:6,bedrock:6,rekognition:6,vertex_ai:6,vision_ai:6,
  azure_openai:6,cognitive_svc:6,az_ml:6,az_databricks:6,power_bi:6,looker:6,dataproc:6,
};

// Tier labels and Y positions
const TIER_META={
  1:{label:"Edge / CDN / DNS",     y:80,  color:"#8B5CF6"},
  2:{label:"Network / LB",         y:185, color:"#0EA5E9"},
  3:{label:"Compute",              y:300, color:"#F97316"},
  4:{label:"Database / Cache",     y:420, color:"#6366F1"},
  5:{label:"Storage / Messaging",  y:530, color:"#10B981"},
  6:{label:"Security / Observability", y:640, color:"#EF4444"},
};

// ─── Architecture Diagram component ──────────────────────────────────────
function ArchDiagram({resources,microservices,cloud,deployTarget}){
  const [tip,setTip]=useState(null); // {x,y,label,desc}
  const catColor=cat=>(CAT_BG[cloud]||CAT_BG.aws)[cat]||"#475569";

  // Build tier groups from selected resources
  const tiers={1:[],2:[],3:[],4:[],5:[],6:[]};
  resources.forEach(r=>{
    const t=TIER_MAP[r.serviceId];
    if(!t)return;
    r.names.forEach((name,i)=>{
      tiers[t].push({id:`${r.serviceId}_${i}`,serviceId:r.serviceId,abbr:r.abbr,
        label:r.label,cat:r.cat,name:name||(r.abbr.toLowerCase()+"-"+(i+1)),color:catColor(r.cat)});
    });
  });

  // Default compute node if tier 3 empty
  if(tiers[3].length===0&&deployTarget){
    const DT={ecs:{abbr:"ECS",label:"ECS Fargate",cat:"Compute"},
      eks:{abbr:"EKS",label:"EKS Cluster",cat:"Compute"},
      aca:{abbr:"ACA",label:"Container Apps",cat:"Compute"},
      aks:{abbr:"AKS",label:"AKS Cluster",cat:"Compute"},
      cloud_run:{abbr:"RUN",label:"Cloud Run",cat:"Compute"},
      gke:{abbr:"GKE",label:"GKE Cluster",cat:"Compute"}};
    const d=DT[deployTarget];
    if(d)tiers[3].push({id:"dt_0",serviceId:deployTarget,abbr:d.abbr,label:d.label,
      cat:d.cat,name:deployTarget,color:catColor(d.cat)});
  }

  // Node box dims
  const NW=108,NH=48,HGAP=10,MAX_ROW=7,CANVAS_W=860;

  // Position nodes in a tier, multi-row if needed
  const layoutTier=(nodes,baseY)=>{
    if(!nodes.length)return[];
    const rows=[];
    for(let i=0;i<nodes.length;i+=MAX_ROW)rows.push(nodes.slice(i,i+MAX_ROW));
    return rows.flatMap((row,ri)=>{
      const rw=row.length*(NW+HGAP)-HGAP;
      const sx=(CANVAS_W-rw)/2;
      return row.map((n,ci)=>({...n,x:sx+ci*(NW+HGAP),y:baseY+ri*(NH+10)}));
    });
  };

  // Build all positioned nodes
  const positioned={};
  const allNodes=[];
  [1,2,3,4,5,6].forEach(t=>{
    const nodes=layoutTier(tiers[t],TIER_META[t].y);
    positioned[t]=nodes;
    allNodes.push(...nodes);
  });

  // Add microservices inside tier 3 as small chips
  const svcChips=microservices.map((s,i)=>({...s,idx:i}));

  // SVG height
  const lastNode=allNodes.reduce((m,n)=>n.y+NH>m?n.y+NH:m,TIER_META[1].y+NH);
  const svgH=Math.max(720, lastNode+100);

  // VPC envelope: wraps tiers 2-5
  const vpcNodes=allNodes.filter(n=>[2,3,4,5].includes(TIER_MAP[n.serviceId]||0));
  const vpcT=vpcNodes.length?Math.min(...vpcNodes.map(n=>n.y))-16:TIER_META[2].y-16;
  const vpcB=vpcNodes.length?Math.max(...vpcNodes.map(n=>n.y+NH))+16:TIER_META[5].y+NH+16;

  // Connection rules: which tiers connect
  const EDGES=[
    {from:1,to:2,color:"#0EA5E9"},
    {from:2,to:3,color:"#38BDF8"},
    {from:3,to:4,color:"#818CF8"},
    {from:3,to:5,color:"#34D399"},
    {from:4,to:6,color:"#6B7280",dash:"4 4"},
    {from:5,to:6,color:"#6B7280",dash:"4 4"},
  ];

  // Get center-bottom of tier's first row
  const tierOut=t=>{const ns=positioned[t];if(!ns.length)return null;const mid=ns[Math.floor(ns.length/2)];return{x:mid.x+NW/2,y:mid.y+NH};};
  const tierIn=t=>{const ns=positioned[t];if(!ns.length)return null;const mid=ns[Math.floor(ns.length/2)];return{x:mid.x+NW/2,y:mid.y};};

  // Build bezier path between two tiers
  const tierPath=(fromT,toT,color,dash)=>{
    const a=tierOut(fromT),b=tierIn(toT);
    if(!a||!b)return null;
    const my=(a.y+b.y)/2;
    return <path key={`${fromT}-${toT}`} d={`M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`}
      fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={dash||"none"}
      markerEnd="url(#arch-arrow)" opacity="0.6"/>;
  };

  // Internet → tier 1: fan lines from internet globe to each tier-1 node
  const internetY=30, internetX=CANVAS_W/2;

  return <div style={{background:"#060d1a",borderRadius:12,border:"1px solid #1e3a5f",overflow:"hidden",position:"relative"}}>
    <div style={{padding:"10px 16px",background:"#0a1628",borderBottom:"1px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:14}}>🗺️</span>
        <span style={{fontSize:11,fontWeight:600,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono"}}>ARCHITECTURE PREVIEW</span>
        {allNodes.length===0&&<span style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono"}}>— add resources in step 2 to see them here</span>}
      </div>
      <div style={{display:"flex",gap:6}}>
        {[1,2,3,4,5,6].map(t=>{
          const n=tiers[t].length;
          if(!n)return null;
          return <span key={t} style={{fontSize:9,fontFamily:"JetBrains Mono",background:"#060d1a",border:`1px solid ${TIER_META[t].color}40`,color:TIER_META[t].color,borderRadius:20,padding:"1px 7px"}}>{TIER_META[t].label.split("/")[0].trim()} ×{n}</span>;
        })}
      </div>
    </div>

    <svg width="100%" viewBox={`0 0 ${CANVAS_W} ${svgH}`} style={{display:"block"}}>
      <defs>
        <marker id="arch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M2 2L8 5L2 8" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round"/>
        </marker>
      </defs>

      {/* VPC / VNET envelope */}
      {vpcNodes.length>0&&<>
        <rect x="20" y={vpcT} width={CANVAS_W-40} height={vpcB-vpcT} rx="12"
          fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="6 3"/>
        <rect x="20" y={vpcT} width={98} height={16} rx="4" fill="#0a1628"/>
        <text x="30" y={vpcT+11} fontSize="10" fontFamily="JetBrains Mono" fill="#334d6e">
          {cloud==="aws"?"VPC":cloud==="azure"?"VNET":"VPC"}
        </text>
      </>}

      {/* Tier lane labels */}
      {[1,2,3,4,5,6].map(t=>{
        if(!tiers[t].length)return null;
        const y=TIER_META[t].y+NH/2;
        return <g key={`lane-${t}`}>
          <text x="14" y={y} fontSize="9" fontFamily="JetBrains Mono" fill={TIER_META[t].color}
            transform={`rotate(-90,14,${y})`} textAnchor="middle" opacity="0.7">
            {TIER_META[t].label.split("/")[0].trim()}
          </text>
        </g>;
      })}

      {/* Internet globe (always shown) */}
      <g>
        <circle cx={internetX} cy={internetY} r="22" fill="#0a1628" stroke="#334d6e" strokeWidth="1"/>
        <ellipse cx={internetX} cy={internetY} rx="14" ry="22" fill="none" stroke="#334d6e" strokeWidth="0.8"/>
        <line x1={internetX-22} y1={internetY} x2={internetX+22} y2={internetY} stroke="#334d6e" strokeWidth="0.8"/>
        <text x={internetX} y={internetY+4} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fill="#64748b">INTERNET</text>
      </g>

      {/* Lines from internet to tier 1 nodes */}
      {positioned[1].map(n=>{
        const nx=n.x+NW/2, ny=n.y;
        const my=(internetY+22+ny)/2;
        return <path key={`net-${n.id}`} d={`M${internetX},${internetY+22} C${internetX},${my} ${nx},${my} ${nx},${ny}`}
          fill="none" stroke="#334d6e" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>;
      })}
      {/* If no tier-1 nodes, draw line from internet to tier-2 */}
      {positioned[1].length===0&&positioned[2].map(n=>{
        const nx=n.x+NW/2, ny=n.y;
        const my=(internetY+22+ny)/2;
        return <path key={`net2-${n.id}`} d={`M${internetX},${internetY+22} C${internetX},${my} ${nx},${my} ${nx},${ny}`}
          fill="none" stroke="#334d6e" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>;
      })}
      {positioned[1].length===0&&positioned[2].length===0&&positioned[3].map(n=>{
        const nx=n.x+NW/2, ny=n.y;
        const my=(internetY+22+ny)/2;
        return <path key={`net3-${n.id}`} d={`M${internetX},${internetY+22} C${internetX},${my} ${nx},${my} ${nx},${ny}`}
          fill="none" stroke="#334d6e" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>;
      })}

      {/* Tier-to-tier connections */}
      {EDGES.map(e=>tierPath(e.from,e.to,e.color,e.dash))}

      {/* Fan lines within tiers (connect all nodes in tier to single center of next tier) */}
      {[1,2,3,4,5].map(fromT=>{
        const fromNodes=positioned[fromT];
        if(!fromNodes.length)return null;
        // find the first non-empty next tier
        let toT=fromT+1;
        while(toT<=6&&!positioned[toT].length)toT++;
        if(toT>6)return null;
        const toNodes=positioned[toT];
        const toCenter=toNodes[Math.floor(toNodes.length/2)];
        const tc={x:toCenter.x+NW/2,y:toCenter.y};
        return fromNodes.length>1?fromNodes.map((fn,i)=>{
          if(i===Math.floor(fromNodes.length/2))return null; // center one drawn by main tierPath
          const fx=fn.x+NW/2,fy=fn.y+NH;
          const my=(fy+tc.y)/2;
          return <path key={`fan-${fromT}-${i}`} d={`M${fx},${fy} C${fx},${my} ${tc.x},${my} ${tc.x},${tc.y}`}
            fill="none" stroke={TIER_META[fromT+1<7?fromT+1:6].color} strokeWidth="1" opacity="0.2"/>;
        }):null;
      })}

      {/* All resource nodes */}
      {allNodes.map(n=>{
        const isHov=tip&&tip.id===n.id;
        return <g key={n.id} style={{cursor:"pointer"}}
          onMouseEnter={e=>setTip({id:n.id,x:n.x+NW/2,y:n.y-8,label:n.label,name:n.name,cat:n.cat,color:n.color})}
          onMouseLeave={()=>setTip(null)}>
          {/* Node background */}
          <rect x={n.x} y={n.y} width={NW} height={NH} rx="6"
            fill={isHov?"#0f2944":"#0a1628"} stroke={n.color} strokeWidth={isHov?"1.5":"1"} opacity="0.95"/>
          {/* Colored header bar */}
          <rect x={n.x} y={n.y} width={NW} height={16} rx="6" fill={n.color} opacity="0.9"/>
          <rect x={n.x} y={n.y+10} width={NW} height={6} fill={n.color} opacity="0.9"/>
          {/* Abbreviation in header */}
          <text x={n.x+NW/2} y={n.y+11} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono"
            fontWeight="700" fill="#fff">{n.abbr}</text>
          {/* Instance name */}
          <text x={n.x+NW/2} y={n.y+32} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono"
            fill="#94a3b8">{n.name.length>14?n.name.slice(0,13)+"…":n.name}</text>
        </g>;
      })}

      {/* Microservice chips inside compute tier */}
      {svcChips.length>0&&positioned[3].length>0&&(()=>{
        const computeNodes=positioned[3];
        const cxMin=Math.min(...computeNodes.map(n=>n.x));
        const cxMax=Math.max(...computeNodes.map(n=>n.x+NW));
        const compY=Math.max(...computeNodes.map(n=>n.y+NH));
        const chipW=Math.min(80,(cxMax-cxMin-(svcChips.length-1)*6)/Math.max(svcChips.length,1));
        const totalW=svcChips.length*chipW+(svcChips.length-1)*6;
        const sx=(CANVAS_W-totalW)/2;
        return <g>
          <text x={CANVAS_W/2} y={compY+14} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fill="#475569">services</text>
          {svcChips.map((s,i)=><g key={s.name}>
            <rect x={sx+i*(chipW+6)} y={compY+18} width={chipW} height={18} rx="4"
              fill="#0f2944" stroke="#1e4a7a" strokeWidth="0.8"/>
            <text x={sx+i*(chipW+6)+chipW/2} y={compY+30} textAnchor="middle" fontSize="8"
              fontFamily="JetBrains Mono" fill="#38bdf8">
              {s.name.length>9?s.name.slice(0,8)+"…":s.name}
            </text>
          </g>)}
        </g>;
      })()}

      {/* Empty state overlay */}
      {allNodes.length===0&&<g>
        <text x={CANVAS_W/2} y={svgH/2-20} textAnchor="middle" fontSize="13" fontFamily="JetBrains Mono" fill="#334d6e">No resources selected</text>
        <text x={CANVAS_W/2} y={svgH/2+4} textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono" fill="#1e3a5f">Go back to Step 2 → Cloud Resources to add services</text>
      </g>}

      {/* Tooltip */}
      {tip&&(()=>{
        const tw=140, th=46, tx=Math.min(Math.max(tip.x-tw/2,4),CANVAS_W-tw-4), ty=Math.max(tip.y-th-6,4);
        return <g style={{pointerEvents:"none"}}>
          <rect x={tx} y={ty} width={tw} height={th} rx="6" fill="#0f2944" stroke={tip.color} strokeWidth="1"/>
          <text x={tx+8} y={ty+14} fontSize="10" fontFamily="JetBrains Mono" fontWeight="700" fill="#e2e8f0">{tip.label.length>17?tip.label.slice(0,16)+"…":tip.label}</text>
          <text x={tx+8} y={ty+28} fontSize="9" fontFamily="JetBrains Mono" fill={tip.color}>{tip.name}</text>
          <text x={tx+8} y={ty+40} fontSize="8" fontFamily="JetBrains Mono" fill="#475569">{tip.cat}</text>
        </g>;
      })()}
    </svg>

    {/* Legend */}
    <div style={{padding:"8px 16px",borderTop:"1px solid #1e3a5f",display:"flex",gap:14,flexWrap:"wrap"}}>
      {[1,2,3,4,5,6].filter(t=>tiers[t].length>0).map(t=><div key={t} style={{display:"flex",alignItems:"center",gap:5}}>
        <div style={{width:8,height:8,borderRadius:2,background:TIER_META[t].color}}/>
        <span style={{fontSize:9,fontFamily:"JetBrains Mono",color:"#64748b"}}>{TIER_META[t].label} ({tiers[t].length})</span>
      </div>)}
      {allNodes.length===0&&<span style={{fontSize:9,fontFamily:"JetBrains Mono",color:"#334d6e"}}>Diagram updates live as you select resources</span>}
    </div>

  </div>;
}


// ─── CostSummary ──────────────────────────────────────────────────────────
function CostSummary({resources,cloud}){
  const cm=COST_MAP[cloud]||{};
  let total=0;
  const items=resources.map(r=>{const unit=cm[r.serviceId]||20;const cost=unit*r.count;total+=cost;return{...r,cost};});
  if(!resources.length)return null;
  return(
    <div style={{background:"#0a1010",border:"1px solid #14532d",borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:10,color:"#22c55e",letterSpacing:2,fontFamily:"JetBrains Mono"}}>💰 ESTIMATED MONTHLY COST</div>
        <div style={{display:"flex",gap:14}}>
          <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono"}}>DEV (~30%)</div><div style={{fontSize:16,fontWeight:700,color:"#22c55e",fontFamily:"JetBrains Mono"}}>${Math.round(total*0.3).toLocaleString()}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono"}}>PROD</div><div style={{fontSize:16,fontWeight:700,color:"#38bdf8",fontFamily:"JetBrains Mono"}}>${total.toLocaleString()}</div></div>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {items.slice(0,10).map(r=><div key={r.serviceId} style={{display:"flex",alignItems:"center",gap:5,background:"#060d1a",border:"1px solid #1e3a5f",borderRadius:6,padding:"3px 8px"}}>
          <span style={{fontSize:9,color:"#94a3b8",fontFamily:"JetBrains Mono"}}>{r.abbr}</span>
          {r.count>1&&<span style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono"}}>×{r.count}</span>}
          <span style={{fontSize:9,color:"#22c55e",fontFamily:"JetBrains Mono"}}>${r.cost}/mo</span>
        </div>)}
        {items.length>10&&<div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",alignSelf:"center"}}>+{items.length-10} more</div>}
      </div>
      <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",marginTop:8}}>* Rough estimates. Actual costs vary by region, usage and tier.</div>
    </div>
  );
}

// ─── GitHubModal ──────────────────────────────────────────────────────────
function GitHubModal({outputs,appSlug,onClose}){
  const [token,setToken]=useState("");
  const [repoName,setRepoName]=useState("stackforge-"+appSlug);
  const [isPrivate,setIsPrivate]=useState(true);
  const [status,setStatus]=useState("");
  const [pushing,setPushing]=useState(false);
  const [done,setDone]=useState(false);

  const push=async()=>{
    if(!token.trim()){setStatus("❌ Enter a GitHub Personal Access Token first");return;}
    setPushing(true);setStatus("Authenticating…");
    try{
      const userRes=await fetch("https://api.github.com/user",{headers:{Authorization:"token "+token}});
      if(!userRes.ok)throw new Error("Invalid token — check it has 'repo' scope");
      const user=await userRes.json();
      setStatus("Creating repo "+repoName+"…");
      const repoRes=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{Authorization:"token "+token,"Content-Type":"application/json"},body:JSON.stringify({name:repoName,private:isPrivate,auto_init:false,description:"Generated by StackForge AI"})});
      if(!repoRes.ok){const e=await repoRes.json();throw new Error(e.message||"Repo creation failed");}
      const allFiles=Object.values(outputs).flatMap(t=>parseFiles(t||""));
      let pushed=0;
      for(const {path,content} of allFiles){
        // base64 encode content
        const bytes=new TextEncoder().encode(content);
        let bin="";for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.subarray(i,Math.min(i+8192,bytes.length)));
        const b64=btoa(bin);
        const r=await fetch(`https://api.github.com/repos/${user.login}/${repoName}/contents/${path}`,{method:"PUT",headers:{Authorization:"token "+token,"Content-Type":"application/json"},body:JSON.stringify({message:"Add "+path,content:b64})});
        if(!r.ok){const e=await r.json();throw new Error("Push failed for "+path+": "+e.message);}
        pushed++;
        setStatus(`Pushing files… ${pushed}/${allFiles.length}: ${path.split("/").pop()}`);
      }
      setStatus("✅ Done! "+allFiles.length+" files pushed");
      setDone(true);
    }catch(e){setStatus("❌ "+e.message);}
    setPushing(false);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:14,padding:28,width:460,maxWidth:"90vw"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div style={{fontWeight:700,fontSize:16,display:"flex",alignItems:"center",gap:8}}><span>⚙️</span> Push to GitHub</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",marginBottom:5}}>PERSONAL ACCESS TOKEN (repo scope)</label>
          <input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" style={{width:"100%",background:"#060d1a",border:"1px solid #1e3a5f",color:"#e2e8f0",borderRadius:7,padding:"8px 11px",fontFamily:"JetBrains Mono",fontSize:12,outline:"none"}}/>
          <a href="https://github.com/settings/tokens/new?scopes=repo&description=StackForge+AI" target="_blank" style={{fontSize:10,color:"#38bdf8",fontFamily:"JetBrains Mono",marginTop:4,display:"block"}}>→ Create token on GitHub</a>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",marginBottom:5}}>REPOSITORY NAME</label>
          <input type="text" value={repoName} onChange={e=>setRepoName(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1e3a5f",color:"#38bdf8",borderRadius:7,padding:"8px 11px",fontFamily:"JetBrains Mono",fontSize:12,outline:"none"}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>
          <input type="checkbox" id="gh-priv" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)} style={{accentColor:"#38bdf8"}}/>
          <label htmlFor="gh-priv" style={{fontSize:12,color:"#94a3b8",fontFamily:"JetBrains Mono",cursor:"pointer"}}>Private repository</label>
        </div>
        {status&&<div style={{background:status.startsWith("✅")?"#0f2a1a":status.startsWith("❌")?"#2d0f0f":"#0f2944",border:`1px solid ${status.startsWith("✅")?"#22c55e":status.startsWith("❌")?"#ef4444":"#1e3a5f"}`,borderRadius:7,padding:"8px 12px",fontFamily:"JetBrains Mono",fontSize:11,color:status.startsWith("✅")?"#22c55e":status.startsWith("❌")?"#ef4444":"#7dd3fc",marginBottom:14,wordBreak:"break-all"}}>{status}</div>}
        <div style={{display:"flex",gap:9,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#64748b",padding:"9px 18px",borderRadius:7,fontFamily:"Syne",fontWeight:600,fontSize:12,cursor:"pointer"}}>{done?"Close":"Cancel"}</button>
          {!done&&<button onClick={push} disabled={pushing} style={{background:"linear-gradient(135deg,#0ea5e9,#2563eb)",border:"none",color:"#fff",padding:"9px 20px",borderRadius:7,fontFamily:"Syne",fontWeight:700,fontSize:12,cursor:"pointer",opacity:pushing?.6:1,display:"flex",alignItems:"center",gap:7}}>
            {pushing&&<span style={{width:11,height:11,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>}
            {pushing?"Pushing…":"🚀 Push to GitHub"}
          </button>}
        </div>
      </div>
    </div>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────
function HistoryPanel({onLoad,onClose}){
  const [stacks,setStacks]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{
    try{
      const r=await window.storage.list("sf:");
      if(!r?.keys){setLoading(false);return;}
      // Only top-level keys (no section sub-keys)
      const topKeys=r.keys.filter(k=>k.split(":").length<=8&&!["iac","pipeline","stack","security","config","runbook","secrets","observability"].some(t=>k.endsWith(":"+t)));
      const loaded=[];
      for(const key of topKeys.slice(0,12)){
        const v=await window.storage.get(key);
        if(v?.value){
          const data=JSON.parse(v.value);
          const parts=key.split(":");
          loaded.push({key,cloud:parts[1],pipeline:parts[2],iac:parts[3],deploy:parts[4],data,files:Object.values(data).flatMap(t=>t?(t.match(/# File:/g)||[]).length:0).reduce((a,b)=>a+b,0)});
        }
      }
      setStacks(loaded);
    }catch(e){console.error(e);}
    setLoading(false);
  })();},[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderLeft:"1px solid #38bdf8",width:380,height:"100vh",overflowY:"auto",padding:22}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div style={{fontWeight:700,fontSize:15,display:"flex",alignItems:"center",gap:8}}>💾 Saved Stacks</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>×</button>
        </div>
        {loading&&<div style={{color:"#475569",fontFamily:"JetBrains Mono",fontSize:12,textAlign:"center",padding:"30px 0"}}>Loading…</div>}
        {!loading&&stacks.length===0&&<div style={{color:"#475569",fontFamily:"JetBrains Mono",fontSize:12,textAlign:"center",padding:"30px 0"}}>No saved stacks yet.<br/>Generate a stack to save it.</div>}
        {stacks.map((s,i)=>(
          <div key={s.key} style={{background:"#060d1a",border:"1px solid #1e3a5f",borderRadius:10,padding:14,marginBottom:10}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {[s.cloud,s.pipeline,s.iac,s.deploy].filter(Boolean).map(t=><span key={t} style={{background:"#0f2944",border:"1px solid #1e4a7a",borderRadius:20,padding:"2px 8px",fontSize:9,fontFamily:"JetBrains Mono",color:"#38bdf8"}}>{t}</span>)}
            </div>
            <div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",marginBottom:10}}>{s.files} files generated</div>
            <div style={{display:"flex",gap:7}}>
              <button onClick={()=>{onLoad(s.data);onClose();}} style={{flex:1,background:"linear-gradient(135deg,#0ea5e9,#2563eb)",border:"none",color:"#fff",padding:"6px 12px",borderRadius:6,fontFamily:"Syne",fontWeight:600,fontSize:11,cursor:"pointer"}}>Load Stack</button>
              <button onClick={async()=>{await window.storage.delete(s.key);setStacks(ss=>ss.filter((_,j)=>j!==i));}} style={{background:"transparent",border:"1px solid #2d1a1a",color:"#ef4444",padding:"6px 10px",borderRadius:6,fontFamily:"JetBrains Mono",fontSize:10,cursor:"pointer"}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── DiffViewer ──────────────────────────────────────────────────────────
function DiffViewer({currentOutputs,onClose}){
  const [stacks,setStacks]=useState([]);
  const [selected,setSelected]=useState(null);
  const [activeTab,setActiveTab]=useState("iac");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    try{
      const r=await window.storage.list("sf:");
      if(!r?.keys){setLoading(false);return;}
      const topKeys=r.keys.filter(k=>!["iac","pipeline","stack","security","config","runbook","secrets","observability"].some(t=>k.endsWith(":"+t)));
      const loaded=[];
      for(const key of topKeys.slice(0,8)){
        const v=await window.storage.get(key);
        if(v?.value){
          const data=JSON.parse(v.value);
          const parts=key.split(":");
          loaded.push({key,label:`${parts[1]}·${parts[2]}·${parts[3]}`,data});
        }
      }
      setStacks(loaded);
    }catch(e){}
    setLoading(false);
  })();},[]);

  const diffLines=(a,b)=>{
    const la=(a||"").split("\n"),lb=(b||"").split("\n");
    const out=[];const maxL=Math.max(la.length,lb.length);
    for(let i=0;i<Math.min(maxL,200);i++){
      const l=la[i]??"",r=lb[i]??"";
      if(l===r){out.push({l,r,same:true});}
      else{out.push({l,r,same:false});}
    }
    if(maxL>200)out.push({l:`... ${maxL-200} more lines`,r:"",same:true});
    return out;
  };

  const tabs=Object.keys(currentOutputs||{}).filter(t=>currentOutputs[t]&&!currentOutputs[t].startsWith("❌"));
  const currText=currentOutputs?.[activeTab]||"(empty)";
  const prevText=selected?.data?.[activeTab]||"(empty)";
  const lines=diffLines(currText,prevText);
  const diffs=lines.filter(l=>!l.same).length;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0a1628",border:"1px solid #8b5cf6",borderRadius:14,padding:0,width:"92vw",maxWidth:1100,height:"88vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"14px 20px",borderBottom:"1px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:15}}>⇄</span>
            <span style={{fontWeight:700,fontSize:14}}>Stack Diff Viewer</span>
            {diffs>0&&<span style={{background:"#4c1d95",border:"1px solid #7c3aed",borderRadius:20,padding:"2px 9px",fontSize:10,fontFamily:"JetBrains Mono",color:"#a78bfa"}}>{diffs} changed lines</span>}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Sidebar: pick comparison stack */}
          <div style={{width:220,borderRight:"1px solid #1e3a5f",overflowY:"auto",padding:"12px 8px",flexShrink:0}}>
            <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,padding:"0 6px 8px"}}>COMPARE AGAINST</div>
            {loading&&<div style={{color:"#475569",fontSize:11,fontFamily:"JetBrains Mono",padding:"10px 6px"}}>Loading…</div>}
            {!loading&&stacks.length===0&&<div style={{color:"#475569",fontSize:11,fontFamily:"JetBrains Mono",padding:"10px 6px"}}>No saved stacks yet</div>}
            {stacks.map(s=><div key={s.key} onClick={()=>setSelected(s)}
              style={{padding:"8px 10px",borderRadius:7,marginBottom:5,cursor:"pointer",background:selected?.key===s.key?"#1a0e4a":"#060d1a",border:`1px solid ${selected?.key===s.key?"#7c3aed":"#1e3a5f"}`}}>
              <div style={{fontSize:10,fontFamily:"JetBrains Mono",color:selected?.key===s.key?"#a78bfa":"#64748b",wordBreak:"break-all"}}>{s.label}</div>
            </div>)}
          </div>
          {/* Main diff area */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Tab bar */}
            <div style={{display:"flex",gap:4,padding:"8px 12px",borderBottom:"1px solid #1e3a5f",flexShrink:0,overflowX:"auto"}}>
              {tabs.map(t=><button key={t} onClick={()=>setActiveTab(t)} style={{padding:"3px 10px",borderRadius:4,border:`1px solid ${activeTab===t?"#8b5cf6":"#1e3a5f"}`,background:activeTab===t?"#1a0e4a":"transparent",color:activeTab===t?"#a78bfa":"#64748b",fontSize:10,fontFamily:"JetBrains Mono",cursor:"pointer",whiteSpace:"nowrap"}}>{t}</button>)}
            </div>
            {/* Side by side */}
            {!selected?
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,color:"#475569",fontFamily:"JetBrains Mono",fontSize:12}}>← Select a saved stack to compare</div>:
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",flex:1,overflow:"hidden"}}>
                <div style={{overflowY:"auto",borderRight:"1px solid #1e3a5f"}}>
                  <div style={{padding:"6px 12px",background:"#0f2944",borderBottom:"1px solid #1e3a5f",fontSize:10,fontFamily:"JetBrains Mono",color:"#38bdf8",position:"sticky",top:0}}>CURRENT</div>
                  <pre style={{margin:0,padding:"8px 0",fontFamily:"JetBrains Mono",fontSize:10,lineHeight:1.6}}>
                    {lines.map((l,i)=><div key={i} style={{padding:"0 10px",background:l.same?"transparent":"#0f2a1a",borderLeft:l.same?"2px solid transparent":"2px solid #22c55e",whiteSpace:"pre-wrap",wordBreak:"break-all",color:l.same?"#64748b":"#4ade80"}}>{l.l||" "}</div>)}
                  </pre>
                </div>
                <div style={{overflowY:"auto"}}>
                  <div style={{padding:"6px 12px",background:"#1a0e4a",borderBottom:"1px solid #1e3a5f",fontSize:10,fontFamily:"JetBrains Mono",color:"#a78bfa",position:"sticky",top:0}}>{selected.label}</div>
                  <pre style={{margin:0,padding:"8px 0",fontFamily:"JetBrains Mono",fontSize:10,lineHeight:1.6}}>
                    {lines.map((l,i)=><div key={i} style={{padding:"0 10px",background:l.same?"transparent":"#2d0f50",borderLeft:l.same?"2px solid transparent":"2px solid #8b5cf6",whiteSpace:"pre-wrap",wordBreak:"break-all",color:l.same?"#64748b":"#c4b5fd"}}>{l.r||" "}</div>)}
                  </pre>
                </div>
              </div>}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── ExistingInfraPanel ──────────────────────────────────────────────────
function ExistingInfraPanel({value,onChange}){
  const on=value?.enabled;
  const upd=(k,v)=>onChange({...value,[k]:v});
  const fs={width:"100%",background:"#060d1a",border:"1px solid #1e3a5f",color:"#38bdf8",
    borderRadius:6,padding:"7px 10px",fontFamily:"JetBrains Mono",fontSize:11,outline:"none",marginBottom:8};
  return <div style={{background:"#0a1628",border:`1px solid ${on?"#0ea5e9":"#1e3a5f"}`,borderRadius:12,padding:16,marginBottom:12,transition:"border-color .2s"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:on?14:0}}>
      <div>
        <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:"JetBrains Mono",marginBottom:3}}>🔗 EXTEND EXISTING INFRASTRUCTURE</div>
        <div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono"}}>Have a previous stack? Paste outputs — new modules reference existing resources via data sources</div>
      </div>
      <div onClick={()=>onChange({...value,enabled:!on})} style={{width:38,height:20,background:on?"#0ea5e9":"#1e3a5f",borderRadius:10,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0,marginLeft:12}}>
        <div style={{width:16,height:16,background:"#fff",borderRadius:"50%",position:"absolute",top:2,left:on?20:2,transition:"left .2s"}}/>
      </div>
    </div>
    {on&&<div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:4}}>VPC ID <span style={{color:"#38bdf8"}}>(terraform output vpc_id)</span></div>
          <input value={value.vpcId||""} onChange={e=>upd("vpcId",e.target.value)} placeholder="vpc-0abc123..." style={fs}/>
        </div>
        <div>
          <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:4}}>DB ENDPOINT <span style={{color:"#475569"}}>(skip if creating new DB)</span></div>
          <input value={value.dbEndpoint||""} onChange={e=>upd("dbEndpoint",e.target.value)} placeholder="mydb.xxxx.rds.amazonaws.com" style={fs}/>
        </div>
      </div>
      <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:4}}>PRIVATE SUBNET IDs <span style={{color:"#38bdf8"}}>(terraform output private_subnet_ids)</span></div>
      <input value={value.privateSubnets||""} onChange={e=>upd("privateSubnets",e.target.value)} placeholder="subnet-aaa,subnet-bbb,subnet-ccc" style={fs}/>
      <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:4}}>PUBLIC SUBNET IDs</div>
      <input value={value.publicSubnets||""} onChange={e=>upd("publicSubnets",e.target.value)} placeholder="subnet-xxx,subnet-yyy" style={fs}/>
      <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:4}}>DB SECRET ARN <span style={{color:"#475569"}}>(optional)</span></div>
      <input value={value.dbSecretArn||""} onChange={e=>upd("dbSecretArn",e.target.value)} placeholder="arn:aws:secretsmanager:us-east-1:123:secret:app" style={fs}/>
      <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1,marginBottom:4}}>ADDITIONAL OUTPUTS <span style={{color:"#475569"}}>(key = value, one per line)</span></div>
      <textarea
        value={value.additionalOutputs||""}
        onChange={e=>upd("additionalOutputs",e.target.value)}
        placeholder="alb_arn = arn:aws:elasticloadbalancing:..."
        rows={3}
        style={{...fs,resize:"vertical"}}
      />
      <div style={{background:"#060d1a",border:"1px solid #0f2944",borderRadius:7,padding:"8px 12px",marginTop:4}}>
        <div style={{fontSize:9,color:"#38bdf8",fontFamily:"JetBrains Mono",marginBottom:3}}>💡 GET YOUR OUTPUTS</div>
        <div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",lineHeight:1.7}}>
          Run in your existing stack: <span style={{color:"#38bdf8"}}>terraform output -json</span> or <span style={{color:"#38bdf8"}}>terraform output vpc_id</span><br/>
          New modules use <span style={{color:"#38bdf8"}}>data sources</span> to reference existing resources — nothing gets recreated.
        </div>
      </div>
    </div>}
  </div>;
}


// ─── App ──────────────────────────────────────────────────────────────────
const INIT_FORM={appDescription:"",cloud:"",pipeline:"",iacTool:"terraform",deployTarget:"",region:"",drRegion:"",compliance:"",extras:[],resources:[],microservices:[],configTool:"",configPresets:[],existingInfra:{enabled:false,vpcId:"",privateSubnets:"",publicSubnets:"",dbEndpoint:"",dbSecretArn:"",additionalOutputs:""}};

export default function App(){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState(INIT_FORM);
  const [loading,setLoading]=useState(false);
  const [progressIdx,setProgressIdx]=useState(-1);
  const [outputs,setOutputs]=useState(null);
  const [fromCache,setFromCache]=useState(false);
  const [cachedSections,setCachedSections]=useState({});
  const [activeTab,setActiveTab]=useState("iac");
  const [selectedFile,setSelectedFile]=useState(null);
  const [viewMode,setViewMode]=useState("tree");
  const [copied,setCopied]=useState("");
  const [error,setError]=useState("");
  const [cacheCount,setCacheCount]=useState(0);
  const [step2Tab,setStep2Tab]=useState("resources");
  const [showGitHub,setShowGitHub]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showDiff,setShowDiff]=useState(false);
  const [diffStack,setDiffStack]=useState(null);

  useEffect(()=>{(async()=>{try{const r=await window.storage.list("sf:");if(r?.keys)setCacheCount(r.keys.length);}catch{}})();},[]);

  const allFiles=outputs?Object.values(outputs).flatMap(t=>parseFiles(t||"")):[];
  const fileTree=buildTree(allFiles);
  const appSlug=slug(form.appDescription);
  const availIac=IAC_TOOLS.filter(t=>!t.onlyCloud||t.onlyCloud===form.cloud);

  const handleTabChange=tabId=>{setActiveTab(tabId);const f=parseFiles(outputs?.[tabId]||"");if(f.length)setSelectedFile(f[0]);};

  const generate=async()=>{
    setLoading(true);setError("");setProgressIdx(0);
    const key=ck(form);
    const cached=await cacheGet(key);
    if(cached){setOutputs(cached);setFromCache(true);setCachedSections(Object.fromEntries(TABS.map(t=>[t.id,true])));const f=parseFiles(cached.iac||"");if(f.length)setSelectedFile(f[0]);setStep(4);setLoading(false);setProgressIdx(-1);return;}
    setFromCache(false);
    const results={},newCached={};
    const prompts=makePrompts(form);
    for(let i=0;i<TABS.length;i++){
      const tab=TABS[i];setProgressIdx(i);
      const sKey=`${key}:${tab.id}`;
      const cs=await cacheGet(sKey);
      if(cs){results[tab.id]=cs;newCached[tab.id]=true;setOutputs({...results});if(i===0){const f=parseFiles(cs);if(f.length)setSelectedFile(f[0]);}continue;}
      try{const p=prompts[tab.id];const text=await callClaude(p.system,p.user);results[tab.id]=text;newCached[tab.id]=false;await cacheSet(sKey,text);setOutputs({...results});if(i===0){const f=parseFiles(text);if(f.length)setSelectedFile(f[0]);}}
      catch(e){results[tab.id]=`❌ Failed: ${e.message}`;newCached[tab.id]=false;setOutputs({...results});}
    }
    await cacheSet(key,results);setCachedSections(newCached);setStep(4);setLoading(false);setProgressIdx(-1);
  };

  const retrySection=async tabId=>{
    setLoading(true);setError("");
    try{const p=makePrompts(form)[tabId];const text=await callClaude(p.system,p.user);const updated={...outputs,[tabId]:text};setOutputs(updated);setCachedSections(s=>({...s,[tabId]:false}));await cacheSet(`${ck(form)}:${tabId}`,text);await cacheSet(ck(form),updated);}
    catch(e){setError(`Retry failed: ${e.message}`);}
    setLoading(false);
  };

  const copy=(text,id)=>{navigator.clipboard.writeText(text||"");setCopied(id);setTimeout(()=>setCopied(""),2000);};

  const renderMd=text=>{
    if(!text)return <div style={{color:"#38bdf8",fontFamily:"JetBrains Mono",fontSize:13,padding:20}}>Generating…</div>;
    const lines=text.split("\n");const out=[];let inCode=false,lang="",code=[],k=0;
    for(const line of lines){
      if(line.startsWith("```")){
        if(!inCode){inCode=true;lang=line.slice(3).trim();code=[];}
        else{out.push(<div key={k++} style={{borderRadius:7,overflow:"hidden",border:"1px solid #1e3a5f",marginBottom:12}}>{lang&&<div style={{background:"#060d1a",color:"#475569",fontSize:10,padding:"3px 12px",fontFamily:"JetBrains Mono",borderBottom:"1px solid #1e3a5f"}}>{lang}</div>}<pre style={{background:"#060d1a",padding:"11px 15px",margin:0,overflowX:"auto",fontSize:12,lineHeight:1.6,color:"#e2e8f0",fontFamily:"JetBrains Mono"}}><code>{code.join("\n")}</code></pre></div>);inCode=false;code=[];lang="";}
      }else if(inCode)code.push(line);
      else if(line.startsWith("# File:"))out.push(<div key={k++} style={{background:"#0f2944",border:"1px solid #1e4a7a",borderRadius:5,padding:"5px 11px",margin:"12px 0 4px",display:"flex",gap:6,alignItems:"center"}}><span style={{color:"#38bdf8"}}>📄</span><span style={{color:"#7dd3fc",fontFamily:"JetBrains Mono",fontSize:12,fontWeight:600}}>{line.replace("# File:","").trim()}</span></div>);
      else if(line.startsWith("# "))out.push(<h2 key={k++} style={{color:"#38bdf8",fontFamily:"Syne",fontSize:16,margin:"18px 0 6px",borderBottom:"1px solid #1e3a5f",paddingBottom:4}}>{line.slice(2)}</h2>);
      else if(line.startsWith("## "))out.push(<h3 key={k++} style={{color:"#7dd3fc",fontFamily:"Syne",fontSize:13,margin:"12px 0 3px"}}>{line.slice(3)}</h3>);
      else if(line.match(/^[-*] /))out.push(<div key={k++} style={{color:"#cbd5e1",fontSize:12,padding:"2px 0 2px 8px",display:"flex",gap:6}}><span style={{color:"#38bdf8"}}>▸</span><span>{line.slice(2)}</span></div>);
      else if(line.match(/^\d+\. /))out.push(<div key={k++} style={{color:"#cbd5e1",fontSize:12,padding:"2px 0 2px 8px",display:"flex",gap:6}}><span style={{color:"#38bdf8",minWidth:14}}>{line.match(/^\d+/)[0]}.</span><span>{line.replace(/^\d+\. /,"")}</span></div>);
      else if(line.trim())out.push(<p key={k++} style={{color:"#94a3b8",fontSize:12,margin:"2px 0",lineHeight:1.7}}>{line}</p>);
      else out.push(<div key={k++} style={{height:5}}/>);
    }
    return out;
  };

  const STEP_LABELS=["Configure","Resources","Review","Output"];

  return <div style={{minHeight:"100vh",background:"#060d1a",fontFamily:"Syne, sans-serif",color:"#e2e8f0"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;600;700;800&display=swap');
      *{box-sizing:border-box}
      ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#0d1929}::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:3px}
      .sel{transition:all .15s;cursor:pointer}
      .bp{background:linear-gradient(135deg,#0ea5e9,#2563eb);border:none;color:#fff;padding:11px 24px;border-radius:8px;font-family:Syne;font-weight:700;font-size:14px;cursor:pointer;transition:all .2s}
      .bp:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(14,165,233,.4)}.bp:disabled{opacity:.5;cursor:not-allowed}
      .tab{background:transparent;border:1px solid #1e3a5f;color:#64748b;padding:7px 12px;border-radius:6px;font-family:Syne;font-size:12px;cursor:pointer;transition:all .2s;white-space:nowrap}
      .tab.on{background:#0f2944;border-color:#38bdf8;color:#38bdf8}.tab:hover:not(.on){border-color:#334d6e;color:#94a3b8}
      textarea{background:#0d1929;border:1px solid #1e3a5f;color:#e2e8f0;border-radius:8px;font-family:"JetBrains Mono";font-size:13px;outline:none;transition:border .2s}
      textarea:focus{border-color:#38bdf8}
      input[type=text],input[type=number]{background:#060d1a;border:1px solid #1e3a5f;color:#e2e8f0;border-radius:6px;padding:6px 10px;font-family:"JetBrains Mono";font-size:12px;outline:none;transition:border .2s}
      input:focus{border-color:#38bdf8 !important}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
      .fi{animation:fi .3s ease}
    `}</style>

    {/* Header */}
    <div style={{borderBottom:"1px solid #1e3a5f",padding:"0 20px",position:"sticky",top:0,background:"#060d1a",zIndex:100}}>
      <div style={{maxWidth:1240,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#0ea5e9,#2563eb)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
          <div><div style={{fontWeight:800,fontSize:14,letterSpacing:1}}>STACKFORGE <span style={{color:"#38bdf8"}}>AI</span></div><div style={{fontSize:8,color:"#475569",letterSpacing:2,fontFamily:"JetBrains Mono"}}>DEVOPS STACK GENERATOR</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:4,background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:20,padding:"3px 10px"}}>
            <span style={{fontSize:10}}>💾</span>
            <span style={{fontSize:10,fontFamily:"JetBrains Mono",color:"#22c55e",cursor:"pointer"}} onClick={()=>setShowHistory(true)}>{cacheCount} stacks</span>
            {cacheCount>0&&<button onClick={async()=>{try{const r=await window.storage.list("sf:");if(r?.keys)for(const k of r.keys)await window.storage.delete(k);setCacheCount(0);}catch{}}} style={{background:"none",border:"none",color:"#475569",fontSize:9,cursor:"pointer",fontFamily:"JetBrains Mono",marginLeft:2}}>clear</button>}
          </div>
          <div style={{display:"flex",gap:2,alignItems:"center"}}>
            {STEP_LABELS.map((label,i)=>{const s=i+1,active=step===s,done=step>s;return <div key={s} style={{display:"flex",alignItems:"center",gap:2}}>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,background:active?"#0f2944":done?"rgba(56,189,248,.08)":"transparent",border:`1px solid ${active?"#38bdf8":done?"rgba(56,189,248,.25)":"#1e3a5f"}`}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:active?"#38bdf8":done?"#0ea5e9":"#1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"#fff"}}>{done?"✓":s}</div>
                <span style={{fontSize:9,fontFamily:"JetBrains Mono",color:active?"#38bdf8":done?"#38bdf8":"#475569"}}>{label}</span>
              </div>
              {s<4&&<div style={{width:10,height:1,background:done?"#38bdf8":"#1e3a5f"}}/>}
            </div>;})}
          </div>
        </div>
      </div>
    </div>

    <div style={{maxWidth:1240,margin:"0 auto",padding:"24px 14px"}}>

      {/* ── STEP 1 ── */}
      {step===1&&<div className="fi">
        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{display:"inline-block",background:"#0f2944",border:"1px solid #1e3a5f",borderRadius:20,padding:"2px 12px",fontSize:10,color:"#38bdf8",fontFamily:"JetBrains Mono",marginBottom:9}}>STEP 1 — CONFIGURE</div>
          <h1 style={{fontSize:30,fontWeight:800,margin:"0 0 7px",lineHeight:1.1}}>What are you <span style={{color:"#38bdf8"}}>building?</span></h1>
          <p style={{color:"#64748b",fontFamily:"JetBrains Mono",fontSize:11}}>Pick cloud + pipeline + IaC. Then name your exact resources in Step 2.</p>
        </div>

        {/* ── Quick-start presets ── */}
        {form.cloud&&<div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:12}}>
          <div style={{fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:10}}>⚡ QUICK-START PRESETS</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {PRESETS.map(p=>{const res=p[form.cloud]||[];if(!res.length)return null;return(
              <div key={p.id} onClick={()=>{const built=buildRes(form.cloud,res);setForm(f=>({...f,resources:built,appDescription:f.appDescription||p.desc}));}}
                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",border:"1px solid #1e3a5f",borderRadius:9,cursor:"pointer",background:"#060d1a",minWidth:140,transition:"all .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#38bdf8"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#1e3a5f"}>
                <span style={{fontSize:18}}>{p.icon}</span>
                <div>
                  <div style={{fontWeight:700,color:"#e2e8f0",fontSize:12,fontFamily:"JetBrains Mono"}}>{p.label}</div>
                  <div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",marginTop:1}}>{p.desc}</div>
                  <div style={{fontSize:9,color:"#38bdf880",fontFamily:"JetBrains Mono",marginTop:1}}>{res.length} services pre-selected</div>
                </div>
              </div>
            );})}
          </div>
          {form.resources.length>0&&<div style={{marginTop:8,fontSize:10,color:"#22c55e",fontFamily:"JetBrains Mono"}}>✓ {form.resources.length} services loaded — customise in Step 2</div>}
        </div>}

        <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:18,marginBottom:12}}>
          <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:7}}>APP DESCRIPTION</label>
          <textarea rows={3} placeholder="e.g. Node.js REST API + React frontend, PostgreSQL, Redis, JWT auth, S3 uploads..."
            value={form.appDescription} onChange={e=>setForm(f=>({...f,appDescription:e.target.value}))}
            style={{width:"100%",padding:11,resize:"vertical",lineHeight:1.6}}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16}}>
            <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>CLOUD</label>
            {CLOUDS.map(c=><div key={c.id} className="sel" onClick={()=>setForm(f=>({...f,cloud:c.id,deployTarget:"",resources:[],iacTool:(f.iacTool==="cloudformation"&&c.id!=="aws")||(["bicep","arm"].includes(f.iacTool)&&c.id!=="azure")?"terraform":f.iacTool}))} style={{padding:"9px 12px",border:`1px solid ${form.cloud===c.id?c.color:"#1e3a5f"}`,borderRadius:8,display:"flex",alignItems:"center",gap:8,background:form.cloud===c.id?`${c.color}15`:"transparent",marginBottom:5}}>
              <span style={{fontSize:16}}>{c.icon}</span>
              <span style={{fontWeight:600,color:form.cloud===c.id?c.color:"#94a3b8",fontSize:13}}>{c.label}</span>
              {form.cloud===c.id&&<span style={{marginLeft:"auto",color:c.color}}>✓</span>}
            </div>)}
          </div>
          <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16}}>
            <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>CI/CD PIPELINE</label>
            {PIPELINES.map(p=><div key={p.id} className="sel" onClick={()=>setForm(f=>({...f,pipeline:p.id}))} style={{padding:"9px 12px",border:`1px solid ${form.pipeline===p.id?"#38bdf8":"#1e3a5f"}`,borderRadius:8,display:"flex",alignItems:"center",gap:7,background:form.pipeline===p.id?"#0f2944":"transparent",marginBottom:5}}>
              <span style={{fontSize:13}}>{p.icon}</span>
              <span style={{fontWeight:600,color:form.pipeline===p.id?"#38bdf8":"#94a3b8",fontSize:12}}>{p.label}</span>
              {form.pipeline===p.id&&<span style={{marginLeft:"auto",color:"#38bdf8"}}>✓</span>}
            </div>)}
          </div>
        </div>

        {form.cloud&&<div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:12}}>
          <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>DEPLOY TARGET</label>
          <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
            {(DEPLOY_TARGETS[form.cloud]||[]).map(d=><div key={d.id} className="sel" onClick={()=>setForm(f=>({...f,deployTarget:d.id}))} style={{padding:"9px 14px",border:`1px solid ${form.deployTarget===d.id?"#38bdf8":"#1e3a5f"}`,borderRadius:9,background:form.deployTarget===d.id?"#0f2944":"transparent",minWidth:155}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:16}}>{d.icon}</span>
                <div>
                  <div style={{fontWeight:600,color:form.deployTarget===d.id?"#38bdf8":"#94a3b8",fontSize:12}}>{d.label}</div>
                  {d.note&&<div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",marginTop:1}}>{d.note}</div>}
                </div>
                {form.deployTarget===d.id&&<span style={{marginLeft:"auto",color:"#38bdf8",fontSize:12}}>✓</span>}
              </div>
            </div>)}
          </div>
        </div>}

        <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:12}}>
          <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>IAC TOOL</label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {availIac.map(t=><div key={t.id} className="sel" onClick={()=>setForm(f=>({...f,iacTool:t.id}))} style={{padding:"8px 13px",border:`1px solid ${form.iacTool===t.id?"#38bdf8":"#1e3a5f"}`,borderRadius:8,background:form.iacTool===t.id?"#0f2944":"transparent",minWidth:105}}>
              <div style={{fontWeight:600,color:form.iacTool===t.id?"#38bdf8":"#94a3b8",fontSize:12}}>{t.label}</div>
              {t.sub&&<div style={{fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",marginTop:1}}>{t.sub}</div>}
            </div>)}
          </div>
        </div>

        <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:22}}>
          <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>ADD-ONS</label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {EXTRAS.map(e=>{const on=form.extras.includes(e);return <div key={e} className="sel" onClick={()=>setForm(f=>({...f,extras:on?f.extras.filter(x=>x!==e):[...f.extras,e]}))} style={{padding:"5px 11px",border:`1px solid ${on?"#38bdf8":"#1e3a5f"}`,borderRadius:20,fontSize:11,fontFamily:"JetBrains Mono",color:on?"#38bdf8":"#64748b",background:on?"#0f2944":"transparent"}}>{on?"✓ ":""}{e}</div>;})}
          </div>
        </div>

        {/* Region selector */}
        {form.cloud&&<div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:12}}>
          <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>PRIMARY REGION</label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
            {(REGIONS[form.cloud]||[]).map(r=><div key={r} onClick={()=>setForm(f=>({...f,region:r}))} style={{padding:"4px 11px",border:`1px solid ${form.region===r?"#38bdf8":"#1e3a5f"}`,borderRadius:20,cursor:"pointer",background:form.region===r?"#0f2944":"transparent",fontSize:11,fontFamily:"JetBrains Mono",color:form.region===r?"#38bdf8":"#64748b"}}>{r}</div>)}
          </div>
          {form.region&&<div>
            <label style={{display:"block",fontSize:10,color:"#7dd3fc",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:7}}>DR / SECONDARY REGION <span style={{color:"#475569",fontWeight:400}}>(optional)</span></label>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {(REGIONS[form.cloud]||[]).filter(r=>r!==form.region).map(r=><div key={r} onClick={()=>setForm(f=>({...f,drRegion:f.drRegion===r?"":r}))} style={{padding:"4px 11px",border:`1px solid ${form.drRegion===r?"#7dd3fc":"#1e3a5f"}`,borderRadius:20,cursor:"pointer",background:form.drRegion===r?"#0f1a2e":"transparent",fontSize:11,fontFamily:"JetBrains Mono",color:form.drRegion===r?"#7dd3fc":"#64748b"}}>{r}</div>)}
            </div>
          </div>}
        </div>}

        {/* Compliance profile */}
        <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:22}}>
          <label style={{display:"block",fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>COMPLIANCE PROFILE</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {COMPLIANCE.map(cp=><div key={cp.id} onClick={()=>setForm(f=>({...f,compliance:cp.id}))} style={{padding:"7px 14px",border:`1px solid ${form.compliance===cp.id?cp.color:"#1e3a5f"}`,borderRadius:8,cursor:"pointer",background:form.compliance===cp.id?cp.color+"15":"transparent",minWidth:90,textAlign:"center"}}>
              <div style={{fontWeight:600,fontSize:12,fontFamily:"JetBrains Mono",color:form.compliance===cp.id?cp.color:"#94a3b8"}}>{cp.label}</div>
            </div>)}
          </div>
          {form.compliance&&<div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",marginTop:8,lineHeight:1.6}}>{COMPLIANCE.find(cp=>cp.id===form.compliance)?.extra}</div>}
        </div>

        {/* Existing infrastructure panel */}
        <ExistingInfraPanel
          value={form.existingInfra}
          onChange={v=>setForm(f=>({...f,existingInfra:v}))}
        />

        <div style={{textAlign:"center"}}>
          <button className="bp" disabled={!form.appDescription||!form.cloud||!form.pipeline} onClick={()=>setStep(2)} style={{fontSize:14,padding:"12px 40px"}}>Next: Resources & Config →</button>
          {(!form.appDescription||!form.cloud||!form.pipeline)&&<p style={{color:"#475569",fontSize:10,fontFamily:"JetBrains Mono",marginTop:7}}>Fill in description, cloud, and pipeline to continue</p>}
        </div>
      </div>}

      {/* ── STEP 2 ── */}
      {step===2&&<div className="fi">
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{display:"inline-block",background:"#0f2944",border:"1px solid #1e3a5f",borderRadius:20,padding:"2px 12px",fontSize:10,color:"#38bdf8",fontFamily:"JetBrains Mono",marginBottom:9}}>STEP 2 — RESOURCES & CONFIG</div>
          <h1 style={{fontSize:30,fontWeight:800,margin:"0 0 6px"}}>Pick, name & <span style={{color:"#38bdf8"}}>configure</span></h1>
        </div>

        {/* Sub-tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[{id:"resources",label:"☁️ Cloud Resources"},{id:"services",label:"⚙️ Microservices"},{id:"config",label:"🔧 Config Mgmt"}].map(t=><button key={t.id} onClick={()=>setStep2Tab(t.id)} className={`tab ${step2Tab===t.id?"on":""}`}>{t.label}{t.id==="resources"&&form.resources.length>0?<span style={{marginLeft:5,background:"#0ea5e9",color:"#fff",borderRadius:20,padding:"0 5px",fontSize:9,fontFamily:"JetBrains Mono"}}>{form.resources.length}</span>:null}{t.id==="services"&&form.microservices.length>0?<span style={{marginLeft:5,background:"#0ea5e9",color:"#fff",borderRadius:20,padding:"0 5px",fontSize:9,fontFamily:"JetBrains Mono"}}>{form.microservices.length}</span>:null}</button>)}
        </div>

        <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:18,marginBottom:14}}>
          {step2Tab==="resources"&&form.cloud&&<div>
          {/* Environment presets */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:9}}>ENVIRONMENT PRESETS <span style={{color:"#475569",fontWeight:400}}>(click to pre-fill)</span></div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {PRESETS.map(p=>{
                const hasCloud=Array.isArray(p[form.cloud])&&p[form.cloud].length>0;
                return <div key={p.id} onClick={()=>{if(!hasCloud)return;const rs=buildRes(form.cloud,p[form.cloud]);setForm(f=>({...f,resources:rs}));}} style={{padding:"9px 14px",border:"1px solid #1e3a5f",borderRadius:8,cursor:hasCloud?"pointer":"not-allowed",background:"#060d1a",minWidth:120,opacity:hasCloud?1:.4}}>
                  <div style={{fontSize:18,marginBottom:3}}>{p.icon}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0",fontFamily:"JetBrains Mono"}}>{p.label}</div>
                  <div style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",marginTop:2}}>{p.desc}</div>
                </div>;
              })}
            </div>
          </div>
          <CostSummary resources={form.resources} cloud={form.cloud}/>
          <ResourceBuilder cloud={form.cloud} resources={form.resources} onChange={r=>setForm(f=>({...f,resources:r}))}/>
        </div>}
          {step2Tab==="services"&&<MicroserviceBuilder services={form.microservices} onChange={s=>setForm(f=>({...f,microservices:s}))}/>}
          {step2Tab==="config"&&<ConfigMgmtBuilder configTool={form.configTool} configPresets={form.configPresets} onChange={({configTool,configPresets})=>setForm(f=>({...f,configTool,configPresets}))}/>}
        </div>

        {/* Summary chips */}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16,padding:"10px 14px",background:"#060d1a",border:"1px solid #1e3a5f",borderRadius:9}}>
          <span style={{fontSize:10,color:"#475569",fontFamily:"JetBrains Mono",alignSelf:"center"}}>Selected:</span>
          {form.resources.map(r=><span key={r.serviceId} style={{display:"flex",alignItems:"center",gap:5,background:"#0f2944",border:"1px solid #1e4a7a",borderRadius:20,padding:"2px 9px",fontSize:10,fontFamily:"JetBrains Mono",color:"#38bdf8"}}><ServiceBadge abbr={r.abbr} cat={r.cat} cloud={form.cloud} size={14}/>{r.label} ×{r.count}</span>)}
          {form.microservices.map(s=><span key={s.name} style={{background:"#0f1f0f",border:"1px solid #166534",borderRadius:20,padding:"2px 9px",fontSize:10,fontFamily:"JetBrains Mono",color:"#22c55e"}}>⚙️ {s.name}:{s.port}</span>)}
          {form.configTool&&<span style={{background:"#2d1a0f",border:"1px solid #92400e",borderRadius:20,padding:"2px 9px",fontSize:10,fontFamily:"JetBrains Mono",color:"#f59e0b"}}>🔧 {CONFIG_TOOLS.find(t=>t.id===form.configTool)?.label} ({form.configPresets.length} presets)</span>}
          {!form.resources.length&&!form.microservices.length&&!form.configTool&&<span style={{color:"#475569",fontSize:10,fontFamily:"JetBrains Mono"}}>Nothing selected — Claude will use sensible defaults</span>}
        </div>

        {/* Live architecture preview in step 2 - only when resources selected */}
        {form.resources.length>0&&<div style={{marginBottom:14}}>
          <ArchDiagram resources={form.resources} microservices={form.microservices} cloud={form.cloud} deployTarget={form.deployTarget}/>
        </div>}

        <div style={{display:"flex",gap:9,justifyContent:"center"}}>
          <button onClick={()=>setStep(1)} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#64748b",padding:"10px 20px",borderRadius:8,fontFamily:"Syne",fontWeight:600,fontSize:12,cursor:"pointer"}}>← Back</button>
          <button className="bp" onClick={()=>setStep(3)} style={{fontSize:13,padding:"10px 36px"}}>Review & Generate →</button>
        </div>
      </div>}

      {/* ── STEP 3 ── */}
      {step===3&&<div className="fi">
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{display:"inline-block",background:"#0f2944",border:"1px solid #1e3a5f",borderRadius:20,padding:"2px 12px",fontSize:10,color:"#38bdf8",fontFamily:"JetBrains Mono",marginBottom:9}}>STEP 3 — REVIEW</div>
          <h1 style={{fontSize:30,fontWeight:800,margin:"0 0 6px"}}>Ready to <span style={{color:"#38bdf8"}}>generate</span></h1>
        </div>

        {/* Architecture diagram */}
        <div style={{marginBottom:14}}>
          <ArchDiagram resources={form.resources} microservices={form.microservices} cloud={form.cloud} deployTarget={form.deployTarget}/>
        </div>

        {/* Folder preview */}
        <div style={{background:"#0a1628",border:"1px solid #38bdf8",borderRadius:12,padding:18,marginBottom:12}}>
          <div style={{fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:11}}>📁 FOLDER STRUCTURE</div>
          <pre style={{fontFamily:"JetBrains Mono",fontSize:11,color:"#94a3b8",lineHeight:1.85,margin:0}}>{
`stackforge-${appSlug}/
├── ${form.iacTool}/
│   ├── Makefile  ← terraform validate + plan + apply targets
│   ├── scripts/validate.sh
│   ├── modules/(networking, compute, database, storage, iam)/
│   └── smoke-tests/smoke_test.sh
├── pipelines/
│   ├── frontend/    ← ${PN[form.pipeline]}
│   ├── backend/     ← ${PN[form.pipeline]} (+ DB migration)
│   └── smoke-tests/ ← health_check.sh per endpoint
├── ${["eks","aks","gke"].includes(form.deployTarget)?"helm/app/templates/ (18+ files) + helmfile.yaml":"k8s/ (namespace, deployments, services, ingress, hpa, pdb)"}
├── Dockerfile.frontend + Dockerfile.backend + docker-compose.yml${form.microservices.length?"\n├── "+form.microservices.map(s=>`Dockerfile.${s.name}`).join(" + "):""}
├── security/(iam-policy, cis-checklist, secrets-setup, kms...)
${form.configTool?`├── ${form.configTool}/ ← ${form.configPresets.length} role(s): ${form.configPresets.slice(0,4).join(", ")}${form.configPresets.length>4?"...":""}`:""}
└── docs/runbook.md`}</pre>
        </div>

        {/* Named resources */}
        {form.resources.length>0&&<div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:12,padding:16,marginBottom:12}}>
          <div style={{fontSize:10,color:"#38bdf8",letterSpacing:2,fontFamily:"JetBrains Mono",marginBottom:10}}>⚙️ NAMED RESOURCES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {form.resources.map(r=><div key={r.serviceId} style={{background:"#060d1a",border:"1px solid #1e3a5f",borderRadius:8,padding:"9px 12px",minWidth:140}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}><ServiceBadge abbr={r.abbr} cat={r.cat} cloud={form.cloud} size={20}/><span style={{fontWeight:700,fontSize:11,color:"#e2e8f0",fontFamily:"JetBrains Mono"}}>{r.label}</span></div>
              {r.names.map((n,i)=><div key={i} style={{fontSize:10,color:"#38bdf8",fontFamily:"JetBrains Mono",padding:"1px 0"}}>#{i+1} {n||"(unnamed)"}</div>)}
            </div>)}
          </div>
        </div>}

        {loading&&<div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:10,padding:13,marginBottom:11}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {TABS.map((t,i)=>{const done=progressIdx>i,active=progressIdx===i,cached=cachedSections[t.id];return <div key={t.id} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:20,background:done?(cached?"#0f1f0f":"#0f2a1a"):active?"#0f2944":"#060d1a",border:`1px solid ${done?(cached?"#22c55e":"#16a34a"):active?"#38bdf8":"#1e3a5f"}`,fontSize:10,fontFamily:"JetBrains Mono",color:done?(cached?"#22c55e":"#4ade80"):active?"#38bdf8":"#475569"}}>
              {done?(cached?"💾":"✓"):active?<span style={{width:7,height:7,borderRadius:"50%",border:"1.5px solid #38bdf8",borderTopColor:"transparent",display:"inline-block",animation:"spin .7s linear infinite"}}/>:"○"}
              <span>{t.label}</span>
            </div>;})}
          </div>
        </div>}
        {error&&<div style={{background:"#2d0f0f",border:"1px solid #ef4444",borderRadius:7,padding:9,color:"#ef4444",fontSize:11,fontFamily:"JetBrains Mono",marginBottom:11,textAlign:"center"}}>{error}</div>}

        <div style={{display:"flex",gap:9,justifyContent:"center"}}>
          <button onClick={()=>setStep(2)} disabled={loading} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#64748b",padding:"10px 20px",borderRadius:8,fontFamily:"Syne",fontWeight:600,fontSize:12,cursor:"pointer"}}>← Back</button>
          <button className="bp" disabled={loading} onClick={generate} style={{fontSize:13,padding:"10px 36px",minWidth:190}}>
            {loading?<span style={{display:"flex",alignItems:"center",gap:7}}><span style={{width:12,height:12,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>{TABS[progressIdx]?.label?`Generating ${TABS[progressIdx].label}…`:"Working…"}</span>:"⚡ Generate Stack"}
          </button>
        </div>
      </div>}

      {/* ── STEP 4: Output ── */}
      {step===4&&outputs&&<div className="fi">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13,flexWrap:"wrap",gap:9}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            {fromCache?<span style={{background:"#0f2944",border:"1px solid #38bdf8",borderRadius:20,padding:"2px 10px",fontSize:10,color:"#38bdf8",fontFamily:"JetBrains Mono"}}>💾 From cache — $0</span>:<span style={{background:"#0f2a1a",border:"1px solid #22c55e",borderRadius:20,padding:"2px 10px",fontSize:10,color:"#22c55e",fontFamily:"JetBrains Mono"}}>✓ Generated + cached</span>}
            <h1 style={{fontSize:21,fontWeight:800,margin:0}}>Your <span style={{color:"#38bdf8"}}>DevOps Stack</span></h1>
            <span style={{color:"#475569",fontFamily:"JetBrains Mono",fontSize:11}}>{allFiles.length} files</span>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {TABS.filter(t=>outputs[t.id]?.startsWith("❌")).map(t=><button key={t.id} onClick={()=>retrySection(t.id)} disabled={loading} style={{background:"#2d1a0a",border:"1px solid #f97316",color:"#f97316",padding:"5px 10px",borderRadius:6,fontFamily:"Syne",fontWeight:600,fontSize:10,cursor:"pointer"}}>🔄 Retry {t.label}</button>)}
            <button onClick={()=>setShowHistory(true)} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#64748b",padding:"5px 10px",borderRadius:6,fontFamily:"Syne",fontWeight:600,fontSize:10,cursor:"pointer"}}>💾 Stacks</button>
            <button onClick={()=>setShowDiff(true)} style={{background:"transparent",border:"1px solid #8b5cf6",color:"#8b5cf6",padding:"5px 10px",borderRadius:6,fontFamily:"Syne",fontWeight:600,fontSize:10,cursor:"pointer"}}>⇄ Diff</button>
            <button onClick={()=>setShowGitHub(true)} style={{background:"transparent",border:"1px solid #22c55e",color:"#22c55e",padding:"5px 10px",borderRadius:6,fontFamily:"Syne",fontWeight:600,fontSize:10,cursor:"pointer"}}>⚙️ GitHub</button>
            <button onClick={()=>{setStep(1);setOutputs(null);setSelectedFile(null);setFromCache(false);setCachedSections({});setForm(INIT_FORM);}} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#64748b",padding:"5px 10px",borderRadius:6,fontFamily:"Syne",fontWeight:600,fontSize:10,cursor:"pointer"}}>← New</button>
            <button onClick={()=>{const fm={};Object.values(outputs).forEach(t=>{if(!t)return;parseFiles(t).forEach(({path,content})=>{fm[`stackforge-${appSlug}/${path}`]=content;});});const bytes=buildZip(fm);let bin="";const cs=8192;for(let i=0;i<bytes.length;i+=cs)bin+=String.fromCharCode(...bytes.subarray(i,i+cs));const b64=btoa(bin);const a=document.createElement("a");a.href=`data:application/zip;base64,${b64}`;a.download=`stackforge-${appSlug}.zip`;document.body.appendChild(a);a.click();document.body.removeChild(a);}} className="bp" style={{padding:"5px 13px",fontSize:11,display:"flex",alignItems:"center",gap:5}}>
              📦 Download ZIP ({allFiles.length} files)
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div style={{display:"flex",gap:5,marginBottom:10,overflowX:"auto",paddingBottom:2,alignItems:"center"}}>
          {TABS.map(t=>{
            const isCached=cachedSections[t.id]||fromCache;
            const isFailed=outputs[t.id]?.startsWith("❌");
            const fc=parseFiles(outputs[t.id]||"").length;
            return <button key={t.id} className={`tab ${activeTab===t.id?"on":""}`} onClick={()=>handleTabChange(t.id)}>
              {t.icon} {t.label}
              {t.id==="pipeline"&&<span style={{marginLeft:3,fontSize:8,color:"#fbbf24",fontFamily:"JetBrains Mono"}}>×2</span>}
              {t.id==="config"&&form.configTool&&<span style={{marginLeft:3,fontSize:8,color:"#f59e0b",fontFamily:"JetBrains Mono"}}>{CONFIG_TOOLS.find(x=>x.id===form.configTool)?.icon}</span>}
              <span style={{marginLeft:3,fontSize:8,fontFamily:"JetBrains Mono",color:isFailed?"#f97316":isCached?"#22c55e":"#64748b"}}>{isFailed?"⚠":fc>0?fc+"f":""}</span>
            </button>;
          })}
          <div style={{marginLeft:"auto",display:"flex",gap:4}}>
            {["tree","raw"].map(m=><button key={m} onClick={()=>setViewMode(m)} style={{background:viewMode===m?"#0f2944":"transparent",border:`1px solid ${viewMode===m?"#38bdf8":"#1e3a5f"}`,color:viewMode===m?"#38bdf8":"#64748b",padding:"4px 9px",borderRadius:5,fontFamily:"JetBrains Mono",fontSize:10,cursor:"pointer"}}>{m==="tree"?"📁 Tree":"📄 Raw"}</button>)}
          </div>
        </div>

        {/* Panel */}
        {viewMode==="tree"?(
          <div style={{display:"grid",gridTemplateColumns:"230px 1fr",border:"1px solid #1e3a5f",borderRadius:11,overflow:"hidden",height:620}}>
            <div style={{background:"#060d1a",borderRight:"1px solid #1e3a5f",overflowY:"auto",padding:"7px 3px"}}>
              <div style={{padding:"3px 9px 6px",fontSize:9,color:"#475569",fontFamily:"JetBrains Mono",letterSpacing:1}}>📁 stackforge-{appSlug}/</div>
              {Object.keys(fileTree).length>0?<FileTree tree={fileTree} selectedPath={selectedFile?.path} onSelect={setSelectedFile}/>:<div style={{color:"#475569",fontSize:11,fontFamily:"JetBrains Mono",padding:"18px 9px",textAlign:"center"}}>{loading?"Generating…":"No files yet"}</div>}
            </div>
            <div style={{background:"#0a1628",overflow:"hidden",display:"flex",flexDirection:"column"}}>
              {selectedFile?(<>
                <div style={{padding:"7px 13px",background:"#060d1a",borderBottom:"1px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:12}}>{fileIcon(selectedFile.path)}</span>
                    <span style={{fontFamily:"JetBrains Mono",fontSize:11,color:"#7dd3fc"}}>{selectedFile.path}</span>
                    <span style={{fontSize:9,background:"#0f2944",color:"#475569",padding:"1px 6px",borderRadius:7,fontFamily:"JetBrains Mono"}}>{extLang(selectedFile.path)}</span>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>copy(selectedFile.content,"file")} style={{background:"#0f2944",border:"1px solid #334d6e",color:"#94a3b8",padding:"3px 9px",borderRadius:5,fontFamily:"JetBrains Mono",fontSize:10,cursor:"pointer"}}>{copied==="file"?"✓":"Copy"}</button>
                    <button onClick={()=>{const a=document.createElement("a");a.href="data:text/plain;charset=utf-8,"+encodeURIComponent(selectedFile.content);a.download=selectedFile.path.split("/").pop();document.body.appendChild(a);a.click();document.body.removeChild(a);}} style={{background:"#0f2944",border:"1px solid #334d6e",color:"#94a3b8",padding:"3px 9px",borderRadius:5,fontFamily:"JetBrains Mono",fontSize:10,cursor:"pointer"}}>⬇</button>
                  </div>
                </div>
                <div style={{overflowY:"auto",flex:1}}>
                  <pre style={{margin:0,padding:"14px 16px",overflowX:"auto",fontSize:12,lineHeight:1.7,color:"#e2e8f0",fontFamily:"JetBrains Mono",background:"transparent"}}><code>{selectedFile.content}</code></pre>
                </div>
              </>):<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#475569",fontFamily:"JetBrains Mono",fontSize:12}}>← Select a file to view</div>}
            </div>
          </div>
        ):(
          <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:11,overflow:"hidden"}}>
            <div style={{padding:"8px 13px",background:"#060d1a",borderBottom:"1px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontFamily:"JetBrains Mono",fontSize:11,color:"#7dd3fc"}}>{TABS.find(t=>t.id===activeTab)?.label} — raw</span>
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>copy(outputs[activeTab]||"","raw")} style={{background:"#0f2944",border:"1px solid #334d6e",color:"#94a3b8",padding:"3px 9px",borderRadius:5,fontFamily:"JetBrains Mono",fontSize:10,cursor:"pointer"}}>{copied==="raw"?"✓":"Copy"}</button>
                {!fromCache&&!cachedSections[activeTab]&&<button onClick={()=>retrySection(activeTab)} disabled={loading} style={{background:"#0f2944",border:"1px solid #334d6e",color:"#94a3b8",padding:"3px 9px",borderRadius:5,fontFamily:"JetBrains Mono",fontSize:10,cursor:"pointer"}}>🔄 Regen</button>}
              </div>
            </div>
            <div style={{padding:16,maxHeight:580,overflowY:"auto"}}>{renderMd(outputs[activeTab])}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
          {[`☁️ ${CLOUDS.find(c=>c.id===form.cloud)?.label}`,`🔁 ${PIPELINES.find(p=>p.id===form.pipeline)?.label}`,`🏗️ ${IAC_TOOLS.find(t=>t.id===form.iacTool)?.label}`,...(form.deployTarget?[`⎈ ${(DEPLOY_TARGETS[form.cloud]||[]).find(d=>d.id===form.deployTarget)?.label||""}`]:[]),...(form.configTool?[`🔧 ${CONFIG_TOOLS.find(t=>t.id===form.configTool)?.label}`]:[])].map(c=><div key={c} style={{background:"#0f2944",border:"1px solid #1e3a5f",borderRadius:20,padding:"2px 9px",fontSize:10,fontFamily:"JetBrains Mono",color:"#64748b"}}>{c}</div>)}
          <div style={{marginLeft:"auto"}}>
            <button onClick={()=>{const fm={};Object.values(outputs).forEach(t=>{if(!t)return;parseFiles(t).forEach(({path,content})=>{fm[`stackforge-${appSlug}/${path}`]=content;});});const bytes=buildZip(fm);let bin="";const cs=8192;for(let i=0;i<bytes.length;i+=cs)bin+=String.fromCharCode(...bytes.subarray(i,i+cs));const b64=btoa(bin);const a=document.createElement("a");a.href=`data:application/zip;base64,${b64}`;a.download=`stackforge-${appSlug}.zip`;document.body.appendChild(a);a.click();document.body.removeChild(a);}} className="bp" style={{padding:"5px 14px",fontSize:11}}>
              📦 ZIP ({allFiles.length} files)
            </button>
          </div>
        </div>
      </div>}
    </div>

    {showGitHub&&outputs&&<GitHubModal outputs={outputs} appSlug={appSlug} onClose={()=>setShowGitHub(false)}/>}
    {showHistory&&<HistoryPanel onLoad={data=>{setOutputs(data);setFromCache(true);setCachedSections(Object.fromEntries(TABS.map(t=>[t.id,true])));const f=parseFiles(data.iac||"");if(f.length)setSelectedFile(f[0]);setStep(4);}} onClose={()=>setShowHistory(false)}/>}
    {showDiff&&<DiffViewer currentOutputs={outputs} onClose={()=>setShowDiff(false)}/>}
  </div>;
}