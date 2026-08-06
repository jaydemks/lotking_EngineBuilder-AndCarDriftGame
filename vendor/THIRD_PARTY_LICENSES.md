# Third-party runtime notices

The following third-party components are redistributed by Lot King Engine and generated playable exports under their stated licenses.

## three.js 0.185.1

Copyright © 2010-2026 three.js authors

## cannon.js 0.6.2

Copyright (c) 2015 cannon.js Authors

## JSZip 3.10.1

Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso

## Cinematic lens flare reference and lens dirt texture

The cinematic lens-flare implementation is adapted from Anderson Mancini's R3F Ultimate Lens Flare work. The retained lens-dirt texture is distributed under CC0 1.0 Universal. The complete CC0 legal text is included at `media/lensflare/LICENSE-CC0.txt`.

## Bundled demo city environment

The bundled demo uses [Modern City Block](https://sketchfab.com/3d-models/modern-city-block-c80dba249d9547cbb48d00828d23cfa7) by [akselmot](https://sketchfab.com/akselmot) as its 3D background environment. The model is currently listed under the Sketchfab Free Standard License, which permits commercial and non-commercial use and does not require creator credit. Attribution is nevertheless preserved here and in the demo documentation, including for copies that may have been acquired under the model's earlier reported [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) terms. The copy bundled by Lot King was converted and adapted for the demo scene. The license shown by Sketchfab at the time a particular copy was downloaded remains applicable to that copy.

## Progressive path tracing

The runtime integration uses [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer), copyright (c) 2021 Garrett Johnson, together with [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), copyright (c) 2018 Garrett Johnson, and `xatlas-web`, copyright (c) 2018-2020 Jonathan Young. These components are distributed under the MIT License below.

[Erich Loftis (`erichlof`)](https://github.com/erichlof) and his [THREE.js-PathTracing-Renderer](https://github.com/erichlof/THREE.js-PathTracing-Renderer) are credited as a principal research, architecture and visual reference. That repository is dedicated to the public domain under CC0 1.0 Universal.

## three-simplecloth design reference

Copyright (c) 2026 bandinopla

Cloth Studio's separated-skinned-garment, vertex-color mask and bone-collider authoring workflow is inspired by [bandinopla/three-simplecloth](https://github.com/bandinopla/three-simplecloth), distributed under the MIT License.

## Official Three.js WebGPU compute-cloth reference

The future GPU backend boundary references the official [Three.js WebGPU compute-cloth example](https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/examples/webgpu_compute_cloth.html) at commit `a58e9ecf225b50e4a28a934442e854878bc2a959`. It is covered by the Three.js MIT license and copyright notice above.

## Sketchbook gameplay systems and placeholder assets

The advanced on-foot controller, enter/exit vehicle flow, arcade car, airplane and helicopter systems, Open World metadata and the bundled placeholder GLBs are adapted from [swift502/Sketchbook](https://github.com/swift502/Sketchbook), `Copyright (c) 2020 swift502`. Lot King uses a native Three.js r185/Cannon.js integration rather than redistributing Sketchbook's older application bundle. Thanks to Jan Bláha (`swift502`) and the Sketchbook contributors for making this substantial engine upgrade possible under the MIT License. The unmodified upstream notice is also included beside the assets at `models/sketchbook/LICENSE-Sketchbook-MIT.txt`.

## MIT License (three.js, cannon.js, JSZip, Sketchbook, three-simplecloth, three-gpu-pathtracer, three-mesh-bvh and xatlas-web)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
