// api/templateLibrary.js
// Pre-built infrastructure templates — no AI needed for common stacks.
// All values are variableized from the UI console (resource names, instance types, etc.)

// ── helpers ────────────────────────────────────────────────────────────────
const slug = s => (s||'app').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'app'

// Convert { 'path/file.tf': 'content' } → '# File: ...\n```hcl\ncontent\n```\n...'
export function filesToText(files) {
  return Object.entries(files).map(([path, content]) => {
    const ext = path.split('.').pop().toLowerCase()
    const lang = {tf:'hcl',hcl:'hcl',yml:'yaml',yaml:'yaml',sh:'bash',md:'markdown',json:'json',j2:'jinja2',ini:'ini',cfg:'ini',py:'python',js:'javascript'}[ext]||ext
    return `# File: ${path}\n\`\`\`${lang}\n${content.trim()}\n\`\`\``
  }).join('\n\n')
}

// Build context object from form data
export function buildContext(form) {
  const appName = slug(form.appDescription || 'myapp')
  // Group resources by serviceId, each item = { name, ...props }
  const byService = {}
  for (const r of (form.resources || [])) {
    if (!byService[r.serviceId]) byService[r.serviceId] = []
    r.names.forEach(name => {
      byService[r.serviceId].push({ name, ...(r.props || {}) })
    })
  }
  return {
    app_name:       appName,
    region:         form.region || 'us-east-1',
    env:            'prod',
    cloud:          form.cloud || 'aws',
    deploy_target:  form.deployTarget || '',
    pipeline:       form.pipeline || 'github',
    iac_tool:       form.iacTool || 'terraform',
    config_tool:    form.configTool || '',
    config_presets: form.configPresets || [],
    ...byService,
  }
}

// ── Networking module ──────────────────────────────────────────────────────
function networkingModuleFiles(ctx) {
  return {
    'terraform/modules/networking/main.tf': `
locals {
  az_count = min(length(var.azs), 3)
}

# ── VPC ──────────────────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "\${var.app_name}-\${var.environment}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "\${var.app_name}-\${var.environment}-igw" }
}

# ── Subnets ───────────────────────────────────────────────────────────────
resource "aws_subnet" "public" {
  count                   = local.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true
  tags = {
    Name                     = "\${var.app_name}-\${var.environment}-public-\${count.index + 1}"
    "kubernetes.io/role/elb" = "1"
    Tier                     = "public"
  }
}

resource "aws_subnet" "private" {
  count             = local.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.azs[count.index]
  tags = {
    Name                              = "\${var.app_name}-\${var.environment}-private-\${count.index + 1}"
    "kubernetes.io/role/internal-elb" = "1"
    Tier                              = "private"
  }
}

# ── NAT Gateway (single AZ — add count = local.az_count for HA) ───────────
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
  tags       = { Name = "\${var.app_name}-\${var.environment}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
  tags          = { Name = "\${var.app_name}-\${var.environment}-nat" }
}

# ── Route Tables ──────────────────────────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "\${var.app_name}-\${var.environment}-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "\${var.app_name}-\${var.environment}-private-rt" }
}

resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── Security Groups ───────────────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "\${var.app_name}-\${var.environment}-alb-sg"
  description = "ALB: HTTP/HTTPS inbound from internet"
  vpc_id      = aws_vpc.main.id
  ingress { from_port = 80;  to_port = 80;  protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"]; description = "HTTP" }
  ingress { from_port = 443; to_port = 443; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"]; description = "HTTPS" }
  egress  { from_port = 0;   to_port = 0;   protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "\${var.app_name}-\${var.environment}-alb-sg" }
}

resource "aws_security_group" "compute" {
  name        = "\${var.app_name}-\${var.environment}-compute-sg"
  description = "EC2/ECS: traffic from ALB, SSH from VPC"
  vpc_id      = aws_vpc.main.id
  ingress { from_port = 0;  to_port = 65535; protocol = "tcp"; security_groups = [aws_security_group.alb.id]; description = "All TCP from ALB" }
  ingress { from_port = 22; to_port = 22;    protocol = "tcp"; cidr_blocks = ["10.0.0.0/8"];                  description = "SSH from VPC" }
  egress  { from_port = 0;  to_port = 0;     protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "\${var.app_name}-\${var.environment}-compute-sg" }
}

resource "aws_security_group" "database" {
  name        = "\${var.app_name}-\${var.environment}-db-sg"
  description = "RDS: PostgreSQL/MySQL from compute layer"
  vpc_id      = aws_vpc.main.id
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; security_groups = [aws_security_group.compute.id]; description = "PostgreSQL" }
  ingress { from_port = 3306; to_port = 3306; protocol = "tcp"; security_groups = [aws_security_group.compute.id]; description = "MySQL" }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "\${var.app_name}-\${var.environment}-db-sg" }
}

resource "aws_security_group" "cache" {
  name        = "\${var.app_name}-\${var.environment}-cache-sg"
  description = "ElastiCache: Redis from compute layer"
  vpc_id      = aws_vpc.main.id
  ingress { from_port = 6379; to_port = 6379; protocol = "tcp"; security_groups = [aws_security_group.compute.id]; description = "Redis" }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "\${var.app_name}-\${var.environment}-cache-sg" }
}
`.trim(),

    'terraform/modules/networking/variables.tf': `
variable "app_name"    { type = string }
variable "environment" { type = string }
variable "vpc_cidr"    { type = string; default = "10.0.0.0/16" }
variable "azs"         { type = list(string) }
`.trim(),

    'terraform/modules/networking/outputs.tf': `
output "vpc_id"             { value = aws_vpc.main.id }
output "vpc_cidr"           { value = aws_vpc.main.cidr_block }
output "public_subnet_ids"  { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
output "availability_zones" { value = var.azs }
output "nat_gateway_id"     { value = aws_nat_gateway.main.id }
output "internet_gateway_id"{ value = aws_internet_gateway.main.id }
output "security_group_ids" {
  value = {
    alb      = aws_security_group.alb.id
    compute  = aws_security_group.compute.id
    database = aws_security_group.database.id
    cache    = aws_security_group.cache.id
  }
}
`.trim(),
  }
}

// ── IAM module ─────────────────────────────────────────────────────────────
function iamModuleFiles(ctx) {
  const hasEks = ctx.eks_cluster?.length > 0
  const hasEc2 = (ctx.ec2||ctx.ec2_asg)
  const s3Buckets = (ctx.s3||[]).map(b => b.name)
  const secretNames = (ctx.secrets_mgr||[]).map(s => s.name)

  return {
    'terraform/modules/iam/main.tf': `
# ── EC2 Instance Role ─────────────────────────────────────────────────────
resource "aws_iam_role" "ec2" {
  name = "\${var.app_name}-\${var.environment}-ec2-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_pull" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy" "app_secrets" {
  name = "\${var.app_name}-\${var.environment}-secrets-policy"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManager"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          "arn:aws:secretsmanager:\${var.region}:*:secret:\${var.app_name}/\${var.environment}/*"
        ]
      },
      {
        Sid    = "SSMParameters"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:\${var.region}:*:parameter/\${var.app_name}/\${var.environment}/*"
      },
      {
        Sid    = "S3AppBuckets"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = ${s3Buckets.length > 0
          ? `[\n${s3Buckets.map(b => `          "arn:aws:s3:::${b}", "arn:aws:s3:::${b}/*"`).join(',\n')}\n        ]`
          : `["arn:aws:s3:::\${var.app_name}-\${var.environment}-*", "arn:aws:s3:::\${var.app_name}-\${var.environment}-*/*"]`}
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "\${var.app_name}-\${var.environment}-instance-profile"
  role = aws_iam_role.ec2.name
}
${hasEks ? `
# ── EKS Node Role ─────────────────────────────────────────────────────────
resource "aws_iam_role" "eks_node" {
  name = "\${var.app_name}-\${var.environment}-eks-node-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole"; Effect = "Allow"; Principal = { Service = "ec2.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}
resource "aws_iam_role_policy_attachment" "eks_cni" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}
resource "aws_iam_role_policy_attachment" "eks_ecr" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}` : ''}
`.trim(),

    'terraform/modules/iam/variables.tf': `
variable "app_name"    { type = string }
variable "environment" { type = string }
variable "region"      { type = string }
`.trim(),

    'terraform/modules/iam/outputs.tf': `
output "ec2_role_arn"               { value = aws_iam_role.ec2.arn }
output "ec2_instance_profile_name"  { value = aws_iam_instance_profile.ec2.name }
output "ec2_instance_profile_arn"   { value = aws_iam_instance_profile.ec2.arn }
${hasEks ? `output "eks_node_role_arn" { value = aws_iam_role.eks_node.arn }` : ''}
`.trim(),
  }
}

// ── EC2 Compute module ─────────────────────────────────────────────────────
function ec2ComputeModuleFiles(ctx) {
  const instances = ctx.ec2 || ctx.ec2_asg || []
  const primary   = instances[0] || { name: ctx.app_name, instance_type: 't3.medium', volume_size: 30 }
  const minSize   = primary.min_size || 1
  const maxSize   = primary.max_size || 4
  const desired   = primary.desired_size || minSize
  const iType     = primary.instance_type || 't3.medium'
  const volSize   = primary.volume_size || 30

  return {
    'terraform/modules/compute/main.tf': `
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter { name = "name";          values = ["al2023-ami-*-x86_64"] }
  filter { name = "state";         values = ["available"] }
  filter { name = "architecture";  values = ["x86_64"] }
}

# ── Application Load Balancer ─────────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "\${var.app_name}-\${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids
  enable_deletion_protection = var.environment == "prod"
  tags = { Name = "\${var.app_name}-\${var.environment}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "\${var.app_name}-\${var.environment}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = var.health_check_path
    matcher             = "200-299"
  }
  tags = { Name = "\${var.app_name}-\${var.environment}-tg" }
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect { port = "443"; protocol = "HTTPS"; status_code = "HTTP_301" }
  }
}

# HTTPS listener (set certificate_arn after provisioning ACM cert)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn
  default_action { type = "forward"; target_group_arn = aws_lb_target_group.app.arn }
}

# ── Launch Template ───────────────────────────────────────────────────────
resource "aws_launch_template" "app" {
  name_prefix   = "\${var.instance_name}-lt-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type

  vpc_security_group_ids = [var.compute_security_group_id]
  iam_instance_profile   { name = var.instance_profile_name }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.volume_size
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring { enabled = true }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"   # IMDSv2 mandatory
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(templatefile("\${path.module}/user_data.sh.tpl", {
    app_name    = var.app_name
    environment = var.environment
    region      = var.region
    secret_name = var.app_secret_name
  }))

  tag_specifications {
    resource_type = "instance"
    tags = { Name = var.instance_name; Application = var.app_name; Environment = var.environment }
  }
  tag_specifications {
    resource_type = "volume"
    tags = { Name = "\${var.instance_name}-root" }
  }

  lifecycle { create_before_destroy = true }
}

# ── Auto Scaling Group ────────────────────────────────────────────────────
resource "aws_autoscaling_group" "app" {
  name                      = "\${var.instance_name}-asg"
  vpc_zone_identifier       = var.private_subnet_ids
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 120
  min_size                  = var.min_size
  max_size                  = var.max_size
  desired_capacity          = var.desired_size

  launch_template { id = aws_launch_template.app.id; version = "$Latest" }

  instance_refresh {
    strategy = "Rolling"
    preferences { min_healthy_percentage = 90; instance_warmup = 120 }
  }

  tag { key = "Name"; value = var.instance_name; propagate_at_launch = true }
  tag { key = "Application"; value = var.app_name; propagate_at_launch = true }
  tag { key = "Environment"; value = var.environment; propagate_at_launch = true }

  lifecycle { create_before_destroy = true; ignore_changes = [desired_capacity] }
}

resource "aws_autoscaling_policy" "cpu" {
  name                   = "\${var.instance_name}-cpu-scale"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification { predefined_metric_type = "ASGAverageCPUUtilization" }
    target_value = 70.0
  }
}
`.trim(),

    'terraform/modules/compute/user_data.sh.tpl': `
#!/bin/bash
# Generated by StackForge AI — EC2 bootstrap for \${app_name} (\${environment})
set -euo pipefail
LOG=/var/log/bootstrap.log
exec > >(tee -a $LOG) 2>&1

echo "[bootstrap] Starting \${app_name} setup — $(date)"

# ── System updates ────────────────────────────────────────────────────────
dnf update -y
dnf install -y aws-cli jq unzip curl git

# ── Fetch secrets from AWS Secrets Manager ────────────────────────────────
SECRET=$(aws secretsmanager get-secret-value \\
  --region \${region} \\
  --secret-id "\${secret_name}" \\
  --query SecretString \\
  --output text 2>/dev/null || echo '{}')

# Export env vars from secrets JSON
eval $(echo $SECRET | jq -r 'to_entries | .[] | "export " + .key + "=" + (.value | @sh)')

# ── Fetch DB host from SSM ────────────────────────────────────────────────
DB_HOST=$(aws ssm get-parameter \\
  --region \${region} \\
  --name "/\${app_name}/\${environment}/db/host" \\
  --with-decryption \\
  --query Parameter.Value \\
  --output text 2>/dev/null || echo "localhost")

DB_PORT=$(aws ssm get-parameter \\
  --region \${region} \\
  --name "/\${app_name}/\${environment}/db/port" \\
  --query Parameter.Value \\
  --output text 2>/dev/null || echo "5432")

export DB_HOST DB_PORT APP_ENV=\${environment}

# ── Install Docker ────────────────────────────────────────────────────────
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

# ── Pull and start application ────────────────────────────────────────────
# Replace with your ECR image URI or S3 artifact path:
# AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
# ECR_URI=$AWS_ACCOUNT.dkr.ecr.\${region}.amazonaws.com/\${app_name}
# aws ecr get-login-password --region \${region} | docker login --username AWS --password-stdin $ECR_URI
# docker pull $ECR_URI:latest
# docker run -d --restart=always -p 3000:3000 \\
#   -e DB_HOST=$DB_HOST -e DB_PORT=$DB_PORT \\
#   -e APP_ENV=\${environment} \\
#   --name \${app_name} $ECR_URI:latest

echo "[bootstrap] Done — $(date)"
`.trim(),

    'terraform/modules/compute/variables.tf': `
variable "app_name"                { type = string }
variable "environment"             { type = string }
variable "region"                  { type = string }
variable "vpc_id"                  { type = string }
variable "public_subnet_ids"       { type = list(string) }
variable "private_subnet_ids"      { type = list(string) }
variable "alb_security_group_id"   { type = string }
variable "compute_security_group_id" { type = string }
variable "instance_profile_name"   { type = string }
variable "instance_name"           { type = string; default = "${ctx.app_name}-server" }
variable "instance_type"           { type = string; default = "${iType}" }
variable "volume_size"             { type = number; default = ${volSize} }
variable "min_size"                { type = number; default = ${minSize} }
variable "max_size"                { type = number; default = ${maxSize} }
variable "desired_size"            { type = number; default = ${desired} }
variable "app_port"                { type = number; default = 3000 }
variable "health_check_path"       { type = string; default = "/health" }
variable "acm_certificate_arn"     { type = string; default = "" }
variable "app_secret_name"         { type = string; default = "" }
`.trim(),

    'terraform/modules/compute/outputs.tf': `
output "alb_dns_name"         { value = aws_lb.main.dns_name }
output "alb_arn"              { value = aws_lb.main.arn }
output "alb_zone_id"          { value = aws_lb.main.zone_id }
output "target_group_arn"     { value = aws_lb_target_group.app.arn }
output "autoscaling_group_name" { value = aws_autoscaling_group.app.name }
output "launch_template_id"   { value = aws_launch_template.app.id }
`.trim(),
  }
}

// ── RDS module ─────────────────────────────────────────────────────────────
function rdsModuleFiles(ctx) {
  const dbs = ctx.rds_postgres || ctx.rds_mysql || ctx.aurora_pg || []
  const db   = dbs[0] || { name: `${ctx.app_name}-db`, db_class: 'db.t3.medium', storage_gb: 50, engine_version: '15.4' }
  const isPostgres = !!(ctx.rds_postgres || ctx.aurora_pg)
  const engine = isPostgres ? 'postgres' : 'mysql'
  const port   = isPostgres ? 5432 : 3306
  const family = isPostgres ? `postgres${(db.engine_version||'15.4').split('.')[0]}` : `mysql${(db.engine_version||'8.0').split('.')[0]}.${(db.engine_version||'8.0').split('.')[1]}`

  return {
    'terraform/modules/database/main.tf': `
resource "aws_db_subnet_group" "main" {
  name       = "\${var.app_name}-\${var.environment}-db-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = { Name = "\${var.app_name}-\${var.environment}-db-subnet-group" }
}

resource "aws_db_parameter_group" "main" {
  name   = "\${var.app_name}-\${var.environment}-db-params"
  family = "${family}"
  tags   = { Name = "\${var.app_name}-\${var.environment}-db-params" }
}

# DB credentials stored in Secrets Manager
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  name                    = "\${var.app_name}/\${var.environment}/db/credentials"
  recovery_window_in_days = 7
  tags                    = { Name = "\${var.app_name}-\${var.environment}-db-secret" }
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = "\${var.app_name}_user"
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = ${port}
    dbname   = replace(var.db_identifier, "-", "_")
  })
}

resource "aws_db_instance" "main" {
  identifier             = var.db_identifier
  engine                 = "${engine}"
  engine_version         = var.engine_version
  instance_class         = var.db_class
  allocated_storage      = var.storage_gb
  max_allocated_storage  = var.storage_gb * 2
  storage_type           = "gp3"
  storage_encrypted      = true

  db_name                = replace(var.db_identifier, "-", "_")
  username               = "\${var.app_name}_user"
  password               = random_password.db.result
  port                   = ${port}

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [var.security_group_id]

  multi_az               = var.multi_az
  publicly_accessible    = false
  deletion_protection    = var.environment == "prod"
  skip_final_snapshot    = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "\${var.db_identifier}-final-snapshot" : null

  backup_retention_period = var.environment == "prod" ? 7 : 1
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn         = aws_iam_role.rds_monitoring.arn

  tags = { Name = var.db_identifier }

  lifecycle { prevent_destroy = false }
}

# Enhanced monitoring role
resource "aws_iam_role" "rds_monitoring" {
  name = "\${var.app_name}-\${var.environment}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole"; Effect = "Allow"; Principal = { Service = "monitoring.rds.amazonaws.com" } }]
  })
}
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Store DB host in SSM for EC2 user_data to read
resource "aws_ssm_parameter" "db_host" {
  name  = "/\${var.app_name}/\${var.environment}/db/host"
  type  = "String"
  value = aws_db_instance.main.address
}
resource "aws_ssm_parameter" "db_port" {
  name  = "/\${var.app_name}/\${var.environment}/db/port"
  type  = "String"
  value = tostring(${port})
}
`.trim(),

    'terraform/modules/database/variables.tf': `
variable "app_name"         { type = string }
variable "environment"      { type = string }
variable "vpc_id"           { type = string }
variable "subnet_ids"       { type = list(string) }
variable "security_group_id" { type = string }
variable "db_identifier"    { type = string; default = "${db.name}" }
variable "engine_version"   { type = string; default = "${db.engine_version || '15.4'}" }
variable "db_class"         { type = string; default = "${db.db_class || 'db.t3.medium'}" }
variable "storage_gb"       { type = number; default = ${db.storage_gb || 50} }
variable "multi_az"         { type = bool;   default = false }
`.trim(),

    'terraform/modules/database/outputs.tf': `
output "endpoint"    { value = aws_db_instance.main.address; sensitive = true }
output "port"        { value = aws_db_instance.main.port }
output "db_name"     { value = aws_db_instance.main.db_name }
output "secret_arn"  { value = aws_secretsmanager_secret.db.arn }
output "secret_name" { value = aws_secretsmanager_secret.db.name }
`.trim(),
  }
}

// ── S3 Storage module ──────────────────────────────────────────────────────
function s3ModuleFiles(ctx) {
  const buckets = ctx.s3 || []
  return {
    'terraform/modules/storage/main.tf': `
locals {
  buckets = ${JSON.stringify(buckets.map(b => ({ name: b.name, versioning: b.versioning || 'Enabled' })))}
}

resource "aws_s3_bucket" "buckets" {
  for_each = { for b in local.buckets : b.name => b }
  bucket   = "\${each.key}"
  tags     = { Name = each.key; Application = var.app_name; Environment = var.environment }
}

resource "aws_s3_bucket_versioning" "buckets" {
  for_each = aws_s3_bucket.buckets
  bucket   = each.value.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "buckets" {
  for_each = aws_s3_bucket.buckets
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "buckets" {
  for_each                = aws_s3_bucket.buckets
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "buckets" {
  for_each = aws_s3_bucket.buckets
  bucket   = each.value.id
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  rule {
    id     = "transition-to-ia"
    status = "Enabled"
    transition { days = 90; storage_class = "STANDARD_IA" }
  }
}
`.trim(),

    'terraform/modules/storage/variables.tf': `
variable "app_name"    { type = string }
variable "environment" { type = string }
`.trim(),

    'terraform/modules/storage/outputs.tf': `
output "bucket_ids"   { value = { for k, v in aws_s3_bucket.buckets : k => v.id } }
output "bucket_arns"  { value = { for k, v in aws_s3_bucket.buckets : k => v.arn } }
output "bucket_names" { value = { for k, v in aws_s3_bucket.buckets : k => v.bucket } }
`.trim(),
  }
}

// ── EKS module ─────────────────────────────────────────────────────────────
function eksModuleFiles(ctx) {
  const clusters = ctx.eks_cluster || []
  const cluster  = clusters[0] || { name: `${ctx.app_name}-eks`, k8s_version: '1.29', node_instance_type: 't3.medium', min_nodes: 2, max_nodes: 8 }

  return {
    'terraform/modules/eks/main.tf': `
# ── EKS Cluster ───────────────────────────────────────────────────────────
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.k8s_version

  vpc_config {
    subnet_ids              = concat(var.private_subnet_ids, var.public_subnet_ids)
    security_group_ids      = [aws_security_group.cluster.id]
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
    aws_iam_role_policy_attachment.vpc_resource_controller,
  ]

  tags = { Name = var.cluster_name }
}

# ── Cluster IAM Role ──────────────────────────────────────────────────────
resource "aws_iam_role" "cluster" {
  name = "\${var.cluster_name}-cluster-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole"; Effect = "Allow"; Principal = { Service = "eks.amazonaws.com" } }]
  })
}
resource "aws_iam_role_policy_attachment" "cluster_policy" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}
resource "aws_iam_role_policy_attachment" "vpc_resource_controller" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
}

# ── Cluster Security Group ────────────────────────────────────────────────
resource "aws_security_group" "cluster" {
  name        = "\${var.cluster_name}-cluster-sg"
  description = "EKS cluster control plane communication"
  vpc_id      = var.vpc_id
  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "\${var.cluster_name}-cluster-sg" }
}

# ── Node Group ────────────────────────────────────────────────────────────
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "\${var.cluster_name}-nodes"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = [var.node_instance_type]

  scaling_config {
    desired_size = var.desired_nodes
    min_size     = var.min_nodes
    max_size     = var.max_nodes
  }

  update_config { max_unavailable = 1 }

  launch_template {
    id      = aws_launch_template.node.id
    version = "$Latest"
  }

  tags = { Name = "\${var.cluster_name}-node-group" }
  lifecycle { ignore_changes = [scaling_config[0].desired_size] }
}

resource "aws_launch_template" "node" {
  name_prefix = "\${var.cluster_name}-node-"
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs { volume_size = 50; volume_type = "gp3"; encrypted = true; delete_on_termination = true }
  }
  metadata_options { http_endpoint = "enabled"; http_tokens = "required"; http_put_response_hop_limit = 2 }
  tag_specifications {
    resource_type = "instance"
    tags = { Name = "\${var.cluster_name}-node" }
  }
}

# ── OIDC Provider (for IRSA) ──────────────────────────────────────────────
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}
resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
}
`.trim(),

    'terraform/modules/eks/variables.tf': `
variable "app_name"           { type = string }
variable "environment"        { type = string }
variable "vpc_id"             { type = string }
variable "public_subnet_ids"  { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "node_role_arn"      { type = string }
variable "cluster_name"       { type = string; default = "${cluster.name}" }
variable "k8s_version"        { type = string; default = "${cluster.k8s_version || '1.29'}" }
variable "node_instance_type" { type = string; default = "${cluster.node_instance_type || 't3.medium'}" }
variable "min_nodes"          { type = number; default = ${cluster.min_nodes || 2} }
variable "max_nodes"          { type = number; default = ${cluster.max_nodes || 8} }
variable "desired_nodes"      { type = number; default = ${cluster.min_nodes || 2} }
`.trim(),

    'terraform/modules/eks/outputs.tf': `
output "cluster_name"                      { value = aws_eks_cluster.main.name }
output "cluster_endpoint"                  { value = aws_eks_cluster.main.endpoint }
output "cluster_certificate_authority_data"{ value = aws_eks_cluster.main.certificate_authority[0].data }
output "cluster_arn"                       { value = aws_eks_cluster.main.arn }
output "oidc_provider_arn"                 { value = aws_iam_openid_connect_provider.eks.arn }
output "oidc_provider_url"                 { value = aws_iam_openid_connect_provider.eks.url }
output "kubeconfig_command"                { value = "aws eks update-kubeconfig --region \${var.app_name} --name \${aws_eks_cluster.main.name}" }
`.trim(),
  }
}

// ── ElastiCache module ─────────────────────────────────────────────────────
function elasticacheModuleFiles(ctx) {
  const caches = ctx.elasticache_r || ctx.elasticache_m || []
  const cache   = caches[0] || { name: `${ctx.app_name}-cache`, node_type: 'cache.t3.micro', num_cache_clusters: 1, engine_version: '7.1' }

  return {
    'terraform/modules/cache/main.tf': `
resource "aws_elasticache_subnet_group" "main" {
  name       = "\${var.app_name}-\${var.environment}-cache-subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = var.cache_name
  description                = "\${var.app_name} \${var.environment} Redis cluster"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_clusters
  parameter_group_name       = "default.redis7"
  engine_version             = var.engine_version
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [var.security_group_id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = var.num_cache_clusters > 1
  multi_az_enabled           = var.num_cache_clusters > 1
  snapshot_retention_limit   = 1
  snapshot_window            = "03:00-04:00"
  maintenance_window         = "sun:04:00-sun:05:00"
  apply_immediately          = var.environment != "prod"
  tags                       = { Name = var.cache_name }
}
`.trim(),

    'terraform/modules/cache/variables.tf': `
variable "app_name"          { type = string }
variable "environment"       { type = string }
variable "subnet_ids"        { type = list(string) }
variable "security_group_id" { type = string }
variable "cache_name"        { type = string; default = "${cache.name}" }
variable "node_type"         { type = string; default = "${cache.node_type || 'cache.t3.micro'}" }
variable "num_cache_clusters"{ type = number; default = ${cache.num_cache_clusters || 1} }
variable "engine_version"    { type = string; default = "${cache.engine_version || '7.1'}" }
`.trim(),

    'terraform/modules/cache/outputs.tf': `
output "primary_endpoint"    { value = aws_elasticache_replication_group.main.primary_endpoint_address }
output "reader_endpoint"     { value = aws_elasticache_replication_group.main.reader_endpoint_address }
output "port"                { value = 6379 }
output "replication_group_id"{ value = aws_elasticache_replication_group.main.id }
`.trim(),
  }
}

// ── Root main.tf ────────────────────────────────────────────────────────────
function rootMainTf(ctx) {
  const hasDb    = ctx.rds_postgres || ctx.rds_mysql || ctx.aurora_pg
  const hasS3    = ctx.s3?.length > 0
  const hasCache = ctx.elasticache_r || ctx.elasticache_m
  const hasEks   = ctx.eks_cluster?.length > 0
  const hasEc2   = ctx.ec2?.length > 0 || ctx.ec2_asg?.length > 0 || ctx.deploy_target === 'ec2'

  return `# Generated by StackForge AI
# App: ${ctx.app_name} | Cloud: AWS | Region: ${ctx.region}
# Resources wired via module outputs — no hardcoded IDs anywhere

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws";  version = "~> 5.0" }
    random = { source = "hashicorp/random"; version = "~> 3.0" }
    tls    = { source = "hashicorp/tls"; version = "~> 4.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = var.app_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      GeneratedBy = "StackForge"
    }
  }
}

data "aws_availability_zones" "available" { state = "available" }

# ── Networking (VPC, subnets, IGW, NAT, security groups) ──────────────────
module "networking" {
  source      = "./modules/networking"
  app_name    = var.app_name
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  azs         = data.aws_availability_zones.available.names
}

# ── IAM roles and policies ────────────────────────────────────────────────
module "iam" {
  source      = "./modules/iam"
  app_name    = var.app_name
  environment = var.environment
  region      = var.region
  depends_on  = [module.networking]
}
${hasS3 ? `
# ── S3 Storage ────────────────────────────────────────────────────────────
module "storage" {
  source      = "./modules/storage"
  app_name    = var.app_name
  environment = var.environment
  depends_on  = [module.networking]
}` : ''}
${hasDb ? `
# ── Database (RDS) ────────────────────────────────────────────────────────
module "database" {
  source            = "./modules/database"
  app_name          = var.app_name
  environment       = var.environment
  vpc_id            = module.networking.vpc_id
  subnet_ids        = module.networking.private_subnet_ids
  security_group_id = module.networking.security_group_ids["database"]
  depends_on        = [module.networking]
}` : ''}
${hasCache ? `
# ── Cache (ElastiCache Redis) ─────────────────────────────────────────────
module "cache" {
  source            = "./modules/cache"
  app_name          = var.app_name
  environment       = var.environment
  subnet_ids        = module.networking.private_subnet_ids
  security_group_id = module.networking.security_group_ids["cache"]
  depends_on        = [module.networking]
}` : ''}
${hasEks ? `
# ── EKS Cluster ───────────────────────────────────────────────────────────
module "eks" {
  source              = "./modules/eks"
  app_name            = var.app_name
  environment         = var.environment
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  private_subnet_ids  = module.networking.private_subnet_ids
  node_role_arn       = module.iam.eks_node_role_arn
  depends_on          = [module.networking, module.iam]
}` : ''}
${hasEc2 ? `
# ── EC2 Compute (ALB + ASG + Launch Template) ─────────────────────────────
module "compute" {
  source                    = "./modules/compute"
  app_name                  = var.app_name
  environment               = var.environment
  region                    = var.region
  vpc_id                    = module.networking.vpc_id
  public_subnet_ids         = module.networking.public_subnet_ids
  private_subnet_ids        = module.networking.private_subnet_ids
  alb_security_group_id     = module.networking.security_group_ids["alb"]
  compute_security_group_id = module.networking.security_group_ids["compute"]
  instance_profile_name     = module.iam.ec2_instance_profile_name
  ${hasDb ? `app_secret_name = module.database.secret_name` : ''}
  depends_on = [module.networking, module.iam${hasDb ? ', module.database' : ''}]
}` : ''}
`
}

// ── Root variables.tf ───────────────────────────────────────────────────────
function rootVariablesTf(ctx) {
  return `
variable "app_name"    { type = string; default = "${ctx.app_name}" }
variable "environment" { type = string; default = "${ctx.env}" }
variable "region"      { type = string; default = "${ctx.region}" }
variable "vpc_cidr"    { type = string; default = "10.0.0.0/16" }
`.trim()
}

// ── Root outputs.tf ─────────────────────────────────────────────────────────
function rootOutputsTf(ctx) {
  const hasDb    = ctx.rds_postgres || ctx.rds_mysql || ctx.aurora_pg
  const hasCache = ctx.elasticache_r || ctx.elasticache_m
  const hasEks   = ctx.eks_cluster?.length > 0
  const hasEc2   = ctx.ec2?.length > 0 || ctx.ec2_asg?.length > 0 || ctx.deploy_target === 'ec2'
  const hasS3    = ctx.s3?.length > 0

  return `
# Infrastructure reference — pipe these into dependent stacks via terraform_remote_state
output "vpc_id"             { value = module.networking.vpc_id }
output "public_subnet_ids"  { value = module.networking.public_subnet_ids }
output "private_subnet_ids" { value = module.networking.private_subnet_ids }
output "security_groups"    { value = module.networking.security_group_ids }
${hasDb    ? `output "db_endpoint"   { value = module.database.endpoint; sensitive = true }\noutput "db_secret_arn" { value = module.database.secret_arn }` : ''}
${hasCache ? `output "cache_endpoint"{ value = module.cache.primary_endpoint }` : ''}
${hasEks   ? `output "cluster_name"  { value = module.eks.cluster_name }\noutput "cluster_endpoint" { value = module.eks.cluster_endpoint }\noutput "kubeconfig_cmd" { value = module.eks.kubeconfig_command }` : ''}
${hasEc2   ? `output "alb_dns_name"  { value = module.compute.alb_dns_name }` : ''}
${hasS3    ? `output "bucket_arns"   { value = module.storage.bucket_arns }` : ''}
`.trim()
}

// ── Backend config ──────────────────────────────────────────────────────────
function backendTf(ctx) {
  return `
terraform {
  backend "s3" {
    # Create this bucket first: aws s3 mb s3://${ctx.app_name}-terraform-state
    bucket         = "${ctx.app_name}-terraform-state"
    key            = "${ctx.env}/terraform.tfstate"
    region         = "${ctx.region}"
    encrypt        = true
    dynamodb_table = "${ctx.app_name}-terraform-locks"  # aws dynamodb create-table --table-name ${ctx.app_name}-terraform-locks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
  }
}
`.trim()
}

// ── Makefile ────────────────────────────────────────────────────────────────
function makefileContent(ctx) {
  return `
.PHONY: init plan apply destroy validate fmt

init:
\tterraform init -upgrade

validate: fmt
\tterraform validate

fmt:
\tterraform fmt -recursive

plan:
\tterraform plan -out=tfplan -var="environment=${ctx.env}" -var="region=${ctx.region}"

apply:
\tterraform apply tfplan

apply-auto:
\tterraform apply -auto-approve -var="environment=${ctx.env}" -var="region=${ctx.region}"

destroy:
\t@echo "⚠️  This will DESTROY all infrastructure. Press Ctrl+C to cancel."
\tsleep 5
\tterraform destroy -var="environment=${ctx.env}"

output:
\tterraform output -json
`.trim()
}

// ── GitHub Actions pipeline ─────────────────────────────────────────────────
function githubActionsFiles(ctx) {
  const isEks = ctx.deploy_target === 'eks' || ctx.eks_cluster?.length > 0
  const isEc2 = ctx.deploy_target === 'ec2' || ctx.ec2?.length > 0 || ctx.ec2_asg?.length > 0
  const cluster = (ctx.eks_cluster||[])[0] || { name: `${ctx.app_name}-eks` }
  const instance = (ctx.ec2||ctx.ec2_asg||[])[0] || { name: ctx.app_name }
  const asgName   = `${instance.name}-asg`

  const ec2Pipeline = `
name: Deploy to EC2 (${ctx.app_name})

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: ${ctx.region}
  APP_NAME: ${ctx.app_name}
  ECR_REPO: ${ctx.app_name}

jobs:
  build-and-deploy:
    name: Build → Push → Deploy
    runs-on: ubuntu-latest
    environment: production
    permissions:
      id-token: write
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set image tag
        run: echo "IMAGE_TAG=\${{ github.sha }}" >> $GITHUB_ENV

      - name: Build backend image
        run: |
          docker build \\
            --cache-from \${{ steps.login-ecr.outputs.registry }}/\$ECR_REPO:latest \\
            --tag \${{ steps.login-ecr.outputs.registry }}/\$ECR_REPO:\$IMAGE_TAG \\
            --tag \${{ steps.login-ecr.outputs.registry }}/\$ECR_REPO:latest \\
            --build-arg BUILDKIT_INLINE_CACHE=1 \\
            -f Dockerfile.backend .

      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: \${{ steps.login-ecr.outputs.registry }}/\$ECR_REPO:\${{ env.IMAGE_TAG }}
          exit-code: 1
          severity: CRITICAL

      - name: Push to ECR
        run: |
          docker push \${{ steps.login-ecr.outputs.registry }}/\$ECR_REPO:\$IMAGE_TAG
          docker push \${{ steps.login-ecr.outputs.registry }}/\$ECR_REPO:latest

      - name: Trigger ASG Instance Refresh
        run: |
          ASG_NAME="${asgName}"
          # Update launch template with new image tag via SSM parameter
          aws ssm put-parameter \\
            --name "/${ctx.app_name}/prod/app/image_tag" \\
            --value "\$IMAGE_TAG" \\
            --type String \\
            --overwrite

          # Start rolling instance refresh (replaces instances with new AMI/config)
          REFRESH_ID=$(aws autoscaling start-instance-refresh \\
            --auto-scaling-group-name "$ASG_NAME" \\
            --preferences '{"MinHealthyPercentage":90,"InstanceWarmup":120}' \\
            --query 'InstanceRefreshId' \\
            --output text)
          echo "Instance refresh started: $REFRESH_ID"

          # Wait for refresh to complete
          for i in \$(seq 1 30); do
            STATUS=$(aws autoscaling describe-instance-refreshes \\
              --auto-scaling-group-name "$ASG_NAME" \\
              --instance-refresh-ids "$REFRESH_ID" \\
              --query 'InstanceRefreshes[0].Status' \\
              --output text)
            echo "[$i/30] Refresh status: $STATUS"
            [ "$STATUS" = "Successful" ] && break
            [ "$STATUS" = "Failed" ] && { echo "❌ Refresh failed"; exit 1; }
            [ "$STATUS" = "Cancelled" ] && { echo "❌ Refresh cancelled"; exit 1; }
            sleep 30
          done

      - name: Smoke tests
        run: |
          ALB_DNS=$(aws elbv2 describe-load-balancers \\
            --names "${ctx.app_name}-prod-alb" \\
            --query 'LoadBalancers[0].DNSName' \\
            --output text)
          for i in \$(seq 1 5); do
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$ALB_DNS/health" || echo "000")
            echo "[$i/5] Health check: $HTTP_CODE"
            [ "$HTTP_CODE" = "200" ] && { echo "✅ Smoke tests passed"; exit 0; }
            sleep 15
          done
          echo "❌ Smoke tests failed"
          exit 1

      - name: Notify on failure
        if: failure()
        run: echo "Deploy failed — check logs above"
`

  const eksPipeline = `
name: Deploy to EKS (${ctx.app_name})

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: ${ctx.region}
  EKS_CLUSTER: ${cluster.name}
  APP_NAME: ${ctx.app_name}

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build + push
        run: |
          IMAGE_TAG=\${{ github.sha }}
          docker build -t \${{ steps.login-ecr.outputs.registry }}/\$APP_NAME:\$IMAGE_TAG .
          docker push \${{ steps.login-ecr.outputs.registry }}/\$APP_NAME:\$IMAGE_TAG
          echo "IMAGE_TAG=\$IMAGE_TAG" >> $GITHUB_ENV

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --region \$AWS_REGION --name \$EKS_CLUSTER

      - name: Helm upgrade
        uses: azure/setup-helm@v4
        with: { version: '3.14.0' }

      - run: |
          helm upgrade --install \$APP_NAME ./helm/app \\
            --namespace \$APP_NAME \\
            --create-namespace \\
            --atomic \\
            --wait \\
            --timeout 10m \\
            --set image.tag=\$IMAGE_TAG \\
            -f helm/app/values-prod.yaml
`

  const files = {}
  if (isEc2) {
    files['.github/workflows/deploy.yml'] = ec2Pipeline.trim()
  } else if (isEks) {
    files['.github/workflows/deploy.yml'] = eksPipeline.trim()
  } else {
    files['.github/workflows/deploy.yml'] = ec2Pipeline.trim()
  }
  return files
}

// ── Ansible playbooks ───────────────────────────────────────────────────────
function ansibleFiles(ctx) {
  const presets   = ctx.config_presets || []
  const hostNames = [...(ctx.ec2||[]), ...(ctx.ec2_asg||[])].map(r => r.name)
  const hostList  = hostNames.length > 0
    ? hostNames.map(n => `${n} ansible_host=<IP_OF_${n.toUpperCase().replace(/-/g,'_')}>`).join('\n')
    : 'server1 ansible_host=<EC2_PUBLIC_IP>'

  const files = {}

  files['ansible/ansible.cfg'] = `
[defaults]
inventory        = ./inventory/prod.ini
roles_path       = ./roles
retry_files_enabled = false
host_key_checking = false
timeout          = 30
stdout_callback  = yaml
remote_user      = ec2-user
private_key_file = ~/.ssh/id_rsa

[ssh_connection]
ssh_args         = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no
pipelining       = true
`.trim()

  files['ansible/inventory/prod.ini'] = `
[webservers]
${hostList}

[all:vars]
ansible_python_interpreter=/usr/bin/python3
app_name=${ctx.app_name}
environment=prod
deploy_dir=/opt/${ctx.app_name}
app_user=${ctx.app_name}
log_dir=/var/log/${ctx.app_name}
`.trim()

  files['ansible/group_vars/all.yml'] = `
---
app_name: ${ctx.app_name}
environment: prod
deploy_dir: /opt/{{ app_name }}
app_user: "{{ app_name }}"
log_dir: /var/log/{{ app_name }}
node_version: "20"
`.trim()

  files['ansible/playbooks/site.yml'] = `
---
- name: Full server configuration
  import_playbook: bootstrap.yml

${presets.includes('nginx') ? `- name: Web server setup\n  import_playbook: webserver.yml\n` : ''}${presets.includes('pm2') || presets.includes('nodejs') ? `- name: Node.js + PM2\n  import_playbook: nodejs.yml\n` : ''}${presets.includes('certbot') ? `- name: SSL certificates\n  import_playbook: ssl.yml\n` : ''}${presets.includes('fail2ban') || presets.includes('ufw') ? `- name: Security hardening\n  import_playbook: security.yml\n` : ''}
`.trim()

  files['ansible/playbooks/bootstrap.yml'] = `
---
- name: Bootstrap server
  hosts: all
  become: true
  tasks:
    - name: Update all packages
      package: name=* state=latest
      when: ansible_os_family in ['RedHat', 'Amazon']

    - name: Install base packages
      package:
        name:
          - curl
          - git
          - unzip
          - jq
          - htop
          - vim
          - tmux
          - awscli
        state: present

    - name: Set hostname
      hostname: name="{{ inventory_hostname }}"

    - name: Create app user
      user:
        name: "{{ app_user }}"
        system: true
        shell: /sbin/nologin
        create_home: false

    - name: Create app directories
      file:
        path: "{{ item }}"
        state: directory
        owner: "{{ app_user }}"
        mode: "0755"
      loop:
        - "{{ deploy_dir }}"
        - "{{ log_dir }}"

    - name: Configure sysctl
      sysctl:
        name: "{{ item.key }}"
        value: "{{ item.value }}"
        sysctl_set: true
      loop:
        - { key: net.core.somaxconn,           value: 65535 }
        - { key: net.ipv4.tcp_max_syn_backlog,  value: 65535 }
        - { key: fs.file-max,                   value: 1048576 }

    - name: Set system limits
      pam_limits:
        domain: "*"
        limit_type: "{{ item.type }}"
        limit_item: nofile
        value: "65536"
      loop:
        - { type: soft }
        - { type: hard }
`.trim()

  if (presets.includes('nginx')) {
    files['ansible/roles/nginx/tasks/main.yml'] = `
---
- name: Install nginx
  package: name=nginx state=present

- name: Deploy nginx.conf
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    owner: root
    group: root
    mode: "0644"
    validate: nginx -t -c %s
  notify: restart nginx

- name: Deploy site config
  template:
    src: app.conf.j2
    dest: /etc/nginx/conf.d/{{ app_name }}.conf
    validate: nginx -t -c /etc/nginx/nginx.conf
  notify: restart nginx

- name: Enable and start nginx
  systemd: name=nginx state=started enabled=true daemon_reload=true
`.trim()

    files['ansible/roles/nginx/handlers/main.yml'] = `
---
- name: restart nginx
  systemd: name=nginx state=restarted
- name: reload nginx
  systemd: name=nginx state=reloaded
`.trim()

    files['ansible/roles/nginx/templates/nginx.conf.j2'] = `
user nginx;
worker_processes auto;
worker_rlimit_nofile 65536;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time';

    access_log /var/log/nginx/access.log main;

    sendfile           on;
    tcp_nopush         on;
    tcp_nodelay        on;
    keepalive_timeout  65;
    gzip               on;
    gzip_comp_level    6;
    gzip_types         text/plain text/css application/json application/javascript application/x-javascript text/xml application/xml image/svg+xml;
    server_tokens      off;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    include /etc/nginx/conf.d/*.conf;
}
`.trim()

    files['ansible/roles/nginx/templates/app.conf.j2'] = `
upstream {{ app_name }}_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name _;

    # ALB health check endpoint
    location /health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }

    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass         http://{{ app_name }}_backend;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";
        proxy_connect_timeout 5s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;
        proxy_buffering       off;
    }

    location / {
        root  {{ deploy_dir }}/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    client_max_body_size 50m;
}
`.trim()
  }

  if (presets.includes('pm2')) {
    files['ansible/roles/pm2/tasks/main.yml'] = `
---
- name: Install Node.js via nvm
  shell: |
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source ~/.bashrc && nvm install {{ node_version }} && nvm use {{ node_version }}
  args:
    executable: /bin/bash
    creates: /root/.nvm/versions/node
  environment:
    NVM_DIR: /root/.nvm

- name: Install PM2 globally
  npm: name=pm2 global=true state=present

- name: Deploy ecosystem config
  template:
    src: ecosystem.config.js.j2
    dest: "{{ deploy_dir }}/ecosystem.config.js"
    owner: "{{ app_user }}"
    mode: "0644"

- name: Setup PM2 startup
  shell: pm2 startup systemd -u {{ app_user }} --hp {{ deploy_dir }}
  register: startup_cmd

- name: Enable PM2 service
  systemd: name=pm2-{{ app_user }} enabled=true

- name: Start app with PM2
  shell: pm2 start {{ deploy_dir }}/ecosystem.config.js && pm2 save
  become: true
  become_user: "{{ app_user }}"
`.trim()

    files['ansible/roles/pm2/templates/ecosystem.config.js.j2'] = `
module.exports = {
  apps: [{
    name: '{{ app_name }}',
    script: '{{ deploy_dir }}/backend/dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: '{{ environment }}',
      PORT: 3000,
      APP_NAME: '{{ app_name }}',
    },
    // Fetch secrets at startup via AWS CLI
    env_production: {
      NODE_ENV: 'production',
    },
    log_file: '{{ log_dir }}/pm2-combined.log',
    error_file: '{{ log_dir }}/pm2-error.log',
    out_file: '{{ log_dir }}/pm2-out.log',
    max_memory_restart: '512M',
    exp_backoff_restart_delay: 100,
    watch: false,
  }]
}
`.trim()
  }

  if (presets.includes('certbot')) {
    files['ansible/roles/certbot/tasks/main.yml'] = `
---
- name: Install certbot
  package: name=certbot state=present

- name: Install certbot nginx plugin
  package: name=python3-certbot-nginx state=present

- name: Obtain Let's Encrypt certificate
  command: >
    certbot --nginx
    --non-interactive
    --agree-tos
    --email {{ certbot_email | default('admin@example.com') }}
    --domain {{ certbot_domain }}
    --redirect
  args:
    creates: /etc/letsencrypt/live/{{ certbot_domain }}/fullchain.pem
  notify: restart nginx

- name: Setup auto-renewal timer
  systemd: name=certbot.timer state=started enabled=true
`.trim()
  }

  if (presets.includes('fail2ban')) {
    files['ansible/roles/fail2ban/tasks/main.yml'] = `
---
- name: Install fail2ban
  package: name=fail2ban state=present

- name: Deploy fail2ban jail config
  template:
    src: jail.local.j2
    dest: /etc/fail2ban/jail.local
  notify: restart fail2ban

- name: Enable and start fail2ban
  systemd: name=fail2ban state=started enabled=true
`.trim()

    files['ansible/roles/fail2ban/templates/jail.local.j2'] = `
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd
ignoreip = 127.0.0.1/8 10.0.0.0/8

[sshd]
enabled  = true
port     = ssh
filter   = sshd
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
filter   = nginx-http-auth
port     = http,https

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
port     = http,https
maxretry = 10
`.trim()
  }

  return files
}

// ── Master export: assemble all files → formatted text ─────────────────────
export function generateAwsTerraform(ctx) {
  const files = {}

  Object.assign(files, networkingModuleFiles(ctx))
  Object.assign(files, iamModuleFiles(ctx))

  if (ctx.ec2?.length > 0 || ctx.ec2_asg?.length > 0 || ctx.deploy_target === 'ec2') {
    Object.assign(files, ec2ComputeModuleFiles(ctx))
  }
  if (ctx.eks_cluster?.length > 0 || ctx.deploy_target === 'eks') {
    Object.assign(files, eksModuleFiles(ctx))
  }
  if (ctx.rds_postgres || ctx.rds_mysql || ctx.aurora_pg) {
    Object.assign(files, rdsModuleFiles(ctx))
  }
  if (ctx.elasticache_r || ctx.elasticache_m) {
    Object.assign(files, elasticacheModuleFiles(ctx))
  }
  if (ctx.s3?.length > 0) {
    Object.assign(files, s3ModuleFiles(ctx))
  }

  files['terraform/main.tf']      = rootMainTf(ctx)
  files['terraform/variables.tf'] = rootVariablesTf(ctx)
  files['terraform/outputs.tf']   = rootOutputsTf(ctx)
  files['terraform/backend.tf']   = backendTf(ctx)
  files['terraform/Makefile']     = makefileContent(ctx)

  return filesToText(files)
}

export function generatePipeline(ctx) {
  const files = {}
  if (ctx.pipeline === 'github' || !ctx.pipeline) {
    Object.assign(files, githubActionsFiles(ctx))
  }
  // Add more pipeline providers as needed
  return filesToText(files)
}

export function generateConfig(ctx) {
  if (!ctx.config_tool && ctx.config_presets?.length === 0) return null
  const files = ansibleFiles(ctx)
  return filesToText(files)
}
