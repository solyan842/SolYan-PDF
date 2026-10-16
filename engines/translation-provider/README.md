# SolYan Argos Translation Provider

This directory contains the small MIT-compatible/local provider bridge used by the V1.6 free PDF-translation lane.

## Why the bridge exists

The pinned PDFMathTranslate 1.x HTTP backend provides the stable task API used by SolYan, but its first-party `ArgosTranslator` path contains an upstream runtime defect. SolYan does **not** patch or vendor that AGPL source. Instead, PDFMathTranslate uses its existing OpenAI-compatible provider interface and sends translation prompts to this local bridge.

The bridge extracts only the source-text portion of the PDFMathTranslate prompt, translates it with Argos Translate, and returns a standard non-streaming OpenAI chat-completion response.

## Security boundary

- Default bind is `127.0.0.1:18080`.
- Non-loopback binding is refused unless `ARGOS_BRIDGE_ALLOW_NETWORK=1` is explicitly set.
- If a private container/service network is used, do not publish the bridge port to an untrusted network.
- The bridge accepts no provider API key and performs no cloud call itself.
- A deployment marked `argos` is only local if the bridge, Argos model and PDFMathTranslate service are actually hosted on the trusted local deployment.

## Pinned V1.6 EN -> VI lane

- `argostranslate==1.11.0`
- model: `translate-en_vi-1_9.argosmodel`
- model URL: `https://data.argosopentech.com/argospm/v1/translate-en_vi-1_9.argosmodel`
- SHA-256: `86957101aa4099aa9a1a7492e41987d938d3cf0fdaf4fb684c0797a9d567dd16`

Install the dependency and model in the external translation environment, then run:

```bash
python engines/translation-provider/argos_openai_bridge.py \
  --host 127.0.0.1 \
  --port 18080 \
  --source-language en \
  --target-language vi
```

Configure the separately deployed PDFMathTranslate service with:

```text
OPENAILIKED_BASE_URL=http://127.0.0.1:18080/v1
OPENAILIKED_API_KEY=local-only
OPENAILIKED_MODEL=argos-en-vi
OPENAILIKED_STREAM=false
```

Configure SolYan backend with:

```text
TRANSLATION_DEFAULT_SERVICE=argos
TRANSLATION_UPSTREAM_SERVICE_MAP=argos:openailiked
```

The public browser/API service ID remains `argos`; `openailiked` is an operator-side routing detail and is not exposed as a selectable browser provider.

## Verification

`.github/workflows/pdf-translation-argos-bridge-diagnostic.yml` is a manual/live diagnostic. It pins PDFMathTranslate and the Argos model, starts this bridge, translates a real selectable-text PDF, validates both mono and bilingual PDF outputs, extracts text with Poppler, and requires Vietnamese translation signals before reporting PASS.
