# Local web server for The Raquel. Nothing to install.
# Run it from this folder with:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Then open http://localhost:8000. Press Ctrl+C to stop.
param([int]$Port = 8000, [switch]$AllowSave)
# -AllowSave lets the page write images into assets/ (used to render the menu background).
# Leave it off for normal use.

$root = $PSScriptRoot
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.md' = 'text/plain; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
  '.webp' = 'image/webp'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.hdr' = 'application/octet-stream'
  '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($AllowSave -and $ctx.Request.HttpMethod -eq 'PUT' -and $path -match '^__save/assets/[\w\-]+\.(jpg|png)$') {
      $dest = Join-Path $root ($path -replace '^__save/', '')
      $ms = New-Object IO.MemoryStream
      $ctx.Request.InputStream.CopyTo($ms)
      [IO.File]::WriteAllBytes($dest, $ms.ToArray())
      $res.StatusCode = 204
      $res.Close()
      Write-Host "saved $dest"
      continue
    }
    if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and [IO.File]::Exists($file)) {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $status = 200
    } else {
      $res.StatusCode = 404
      $status = 404
    }
    $res.Close()
    Write-Host "$status $($ctx.Request.Url.AbsolutePath)"
  }
} finally {
  $listener.Stop()
}
