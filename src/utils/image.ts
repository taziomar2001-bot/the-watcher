/**
 * Read an image file and return a small JPEG data URL, centre-cropped to the
 * given aspect (width × height). Keeps uploads tiny enough to store inline.
 */
export function fileToImage(file: File, width: number, height: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      const target = width / height
      let sw = img.width
      let sh = img.height
      if (sw / sh > target) sw = sh * target
      else sh = sw / target
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}
