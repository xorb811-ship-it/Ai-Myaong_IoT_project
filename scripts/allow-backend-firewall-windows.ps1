$ErrorActionPreference = "Stop"

$ruleName = "Ai-Myaong Backend 8000"
$port = 8000

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Any -Direction Inbound -Action Allow
  Set-NetFirewallPortFilter -AssociatedNetFirewallRule $existing -Protocol TCP -LocalPort $port
  Write-Host "Firewall rule already exists and was enabled: $ruleName"
  exit 0
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $port `
  -Profile Any | Out-Null

Write-Host "Firewall rule added: $ruleName (TCP $port inbound)"
