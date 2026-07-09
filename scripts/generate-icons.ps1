param(
  [string]$SourcePath = "src/assets/icon-png.png",
  [string]$OutputDir = "icons",
  [int[]]$Sizes = @(16, 32, 48, 128),
  [double]$SharpenAmount = 0.35   # 0 = off, 0.2-0.5 is a subtle-to-moderate sharpen
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $SourcePath)) {
  throw "Source icon not found: $SourcePath"
}

Add-Type -AssemblyName System.Drawing

$resolvedSource = Resolve-Path $SourcePath
$sourceImage = [System.Drawing.Image]::FromFile($resolvedSource)

Write-Host "Source resolution: $($sourceImage.Width) x $($sourceImage.Height)"
if ($sourceImage.Width -lt 256 -or $sourceImage.Height -lt 256) {
  Write-Warning "Source is smaller than 256x256. Downscaled icons cannot contain more detail than this source has. Consider re-exporting from the original design tool at a higher resolution (512-1024px) for best results."
}

function Apply-UnsharpMask {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [double]$Amount
  )

  if ($Amount -le 0) { return $Bitmap }

  $w = $Bitmap.Width
  $h = $Bitmap.Height

  # 3x3 sharpening kernel (unsharp-style), scaled by Amount
  $center = 1 + (4 * $Amount)
  $edge = -1 * $Amount
  $kernel = @(
    0, $edge, 0,
    $edge, $center, $edge,
    0, $edge, 0
  )

  $src = New-Object System.Drawing.Bitmap $Bitmap
  $result = New-Object System.Drawing.Bitmap $w, $h

  $srcData = $src.LockBits(
    (New-Object System.Drawing.Rectangle 0, 0, $w, $h),
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $dstData = $result.LockBits(
    (New-Object System.Drawing.Rectangle 0, 0, $w, $h),
    [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )

  $stride = $srcData.Stride
  $bytes = $stride * $h
  $srcBuffer = New-Object byte[] $bytes
  $dstBuffer = New-Object byte[] $bytes
  [System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $srcBuffer, 0, $bytes)

  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      for ($c = 0; $c -lt 4; $c++) {
        # c: 0=B,1=G,2=R,3=A - skip sharpening alpha channel to avoid edge halos
        $idx = ($y * $stride) + ($x * 4) + $c

        if ($c -eq 3) {
          $dstBuffer[$idx] = $srcBuffer[$idx]
          continue
        }

        $acc = 0.0
        $k = 0
        for ($ky = -1; $ky -le 1; $ky++) {
          for ($kx = -1; $kx -le 1; $kx++) {
            $sx = [Math]::Min([Math]::Max($x + $kx, 0), $w - 1)
            $sy = [Math]::Min([Math]::Max($y + $ky, 0), $h - 1)
            $sIdx = ($sy * $stride) + ($sx * 4) + $c
            $acc += $srcBuffer[$sIdx] * $kernel[$k]
            $k++
          }
        }

        $val = [Math]::Min([Math]::Max([Math]::Round($acc), 0), 255)
        $dstBuffer[$idx] = [byte]$val
      }
    }
  }

  [System.Runtime.InteropServices.Marshal]::Copy($dstBuffer, 0, $dstData.Scan0, $bytes)
  $src.UnlockBits($srcData)
  $result.UnlockBits($dstData)
  $src.Dispose()

  return $result
}

try {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

  foreach ($size in $Sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        # Slight inset avoids edge-clamp artifacts at exact bounds
        $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
      }
      finally {
        $graphics.Dispose()
      }

      # Sharpen more aggressively at smaller sizes, since bicubic downscaling
      # blurs proportionally more detail the smaller the target gets.
      $sizeAdjustedAmount = $SharpenAmount
      if ($size -le 16) { $sizeAdjustedAmount = $SharpenAmount * 1.6 }
      elseif ($size -le 32) { $sizeAdjustedAmount = $SharpenAmount * 1.3 }

      $sharpened = Apply-UnsharpMask -Bitmap $bitmap -Amount $sizeAdjustedAmount

      $targetPath = Join-Path $OutputDir "icon-$size.png"
      $sharpened.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $sharpened.Dispose()

      Write-Host "Wrote $targetPath ($size x $size, sharpen=$sizeAdjustedAmount)"
    }
    finally {
      $bitmap.Dispose()
    }
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Host ""
Write-Host "Done. If icons still look soft at 16-32px, the limiting factor is source resolution, not this script - re-export the source PNG at 512x512 or larger, or ideally keep an SVG/vector master for pixel-perfect small-size rendering in the future."
