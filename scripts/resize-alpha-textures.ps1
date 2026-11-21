param([string]$TextureDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Get-ChildItem -LiteralPath $TextureDirectory -Filter 'source-*.jpg' | ForEach-Object {
  $inputImage = [System.Drawing.Image]::FromFile($_.FullName)
  $ratio = [Math]::Min([double]1, 2048 / [double][Math]::Max($inputImage.Width, $inputImage.Height))
  $outputImage = [System.Drawing.Bitmap]::new([int]($inputImage.Width * $ratio), [int]($inputImage.Height * $ratio))
  $graphics = [System.Drawing.Graphics]::FromImage($outputImage)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($inputImage, 0, 0, $outputImage.Width, $outputImage.Height)
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
  $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]94)
  $outputImage.Save((Join-Path $TextureDirectory ($_.Name.Replace('source-', 'runtime-'))), $codec, $parameters)
  $graphics.Dispose(); $outputImage.Dispose(); $inputImage.Dispose(); $parameters.Dispose()
}
