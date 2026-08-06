param(
  [string]$SourcePng = "build/icon.png",
  [string]$OutIco = "build/icon.ico"
)

Add-Type -AssemblyName System.Drawing

$sizes = @(256, 128, 64, 48, 32, 16)
$src = [System.Drawing.Image]::FromFile((Resolve-Path $SourcePng))

$pngBlobs = @()
foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $size, $size)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBlobs += ,@{ Size = $size; Bytes = $ms.ToArray() }
  $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
}
$src.Dispose()

$outPath = Join-Path (Get-Location) $OutIco
$fs = [System.IO.File]::Open($outPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR
$bw.Write([UInt16]0)          # reserved
$bw.Write([UInt16]1)          # type = icon
$bw.Write([UInt16]$pngBlobs.Count)

$headerSize = 6 + (16 * $pngBlobs.Count)
$offset = $headerSize
foreach ($item in $pngBlobs) {
  $wh = if ($item.Size -ge 256) { 0 } else { $item.Size }
  $bw.Write([Byte]$wh)                 # width
  $bw.Write([Byte]$wh)                 # height
  $bw.Write([Byte]0)                   # color count
  $bw.Write([Byte]0)                   # reserved
  $bw.Write([UInt16]1)                 # planes
  $bw.Write([UInt16]32)                # bit count
  $bw.Write([UInt32]$item.Bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $item.Bytes.Length
}
foreach ($item in $pngBlobs) {
  $bw.Write($item.Bytes)
}

$bw.Flush(); $bw.Close(); $fs.Close()
Write-Output "ICO scritto: $outPath ($($pngBlobs.Count) risoluzioni)"
