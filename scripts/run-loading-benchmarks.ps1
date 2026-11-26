$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
foreach ($mbps in @(20, 5)) {
    foreach ($label in @('before', 'after')) {
        $origin = if ($label -eq 'before') { 'http://127.0.0.1:5180/' } else { 'http://127.0.0.1:5181/' }
        foreach ($cacheState in @('cold', 'warm')) {
            Write-Output "Starting $label $mbps Mbps $cacheState"
            $benchmarkArgs = @('scripts/benchmark-loading.mjs', $label, $origin, [string]$mbps, '--control')
            if ($cacheState -eq 'warm') { $benchmarkArgs += '--warm' }
            & node @benchmarkArgs
            if ($LASTEXITCODE -ne 0) { throw "Benchmark failed: $label $mbps $cacheState" }
        }
    }
}
