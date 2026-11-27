variable "REGISTRY" {
  default = "registry.arantic.cloud/bugpin"
}
variable "IMAGE_TAGS" {
  default = "[\"latest\"]"
}
variable "IMAGE_LABELS" {
  default = "{}"
}
variable "APP_VERSION" {
  default = ""
}

group "default" {
  targets = ["server", "admin", "portal", "production"]
}

target "_common" {
  context = "."
  dockerfile = "Dockerfile"
  platforms = ["linux/amd64"]
  args = { APP_VERSION = APP_VERSION }
  labels = jsondecode(IMAGE_LABELS)
}

target "server" {
  inherits = ["_common"]
  target = "server"
  cache-from = ["type=gha,scope=bugpin-server"]
  cache-to = ["type=gha,scope=bugpin-server,mode=max"]
  tags = [for tag in jsondecode(IMAGE_TAGS) : "${REGISTRY}/bugpin-server:${tag}"]
}

target "admin" {
  inherits = ["_common"]
  target = "admin"
  cache-from = ["type=gha,scope=bugpin-admin"]
  cache-to = ["type=gha,scope=bugpin-admin,mode=max"]
  tags = [for tag in jsondecode(IMAGE_TAGS) : "${REGISTRY}/bugpin-admin:${tag}"]
}

target "portal" {
  inherits = ["_common"]
  target = "portal"
  cache-from = ["type=gha,scope=bugpin-portal"]
  cache-to = ["type=gha,scope=bugpin-portal,mode=max"]
  tags = [for tag in jsondecode(IMAGE_TAGS) : "${REGISTRY}/bugpin-portal:${tag}"]
}

target "production" {
  inherits = ["_common"]
  target = "production"
  cache-from = ["type=gha,scope=bugpin-production"]
  cache-to = ["type=gha,scope=bugpin-production,mode=max"]
  tags = [for tag in jsondecode(IMAGE_TAGS) : "${REGISTRY}/bugpin:${tag}"]
}
