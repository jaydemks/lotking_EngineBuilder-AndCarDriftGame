# LOT KING HDRI slots

Place four equirectangular `.hdr` files here:

- `dawn.hdr`
- `day.hdr`
- `dusk.hdr`
- `night.hdr`

The engine crossfades the visible sky between the loaded states. If fewer than two HDRI files load, it falls back to the procedural sky.
