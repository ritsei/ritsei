import { defineAnimationStyles, defineConfig } from "@pandacss/dev"

const motionAnimationStyles = defineAnimationStyles({
  "enter-subtle": {
    value: {
      animationName: "enter-subtle",
      animationDuration: "normal",
      animationTimingFunction: "enter",
      animationFillMode: "both",
      _motionReduce: {
        animationName: "fade-in",
        animationDuration: "instant",
        animationTimingFunction: "linear",
      },
    },
  },
  "exit-subtle": {
    value: {
      animationName: "exit-subtle",
      animationDuration: "fast",
      animationTimingFunction: "exit",
      animationFillMode: "both",
      _motionReduce: {
        animationName: "fade-out",
        animationDuration: "instant",
        animationTimingFunction: "linear",
      },
    },
  },
})

export default defineConfig({
  jsxFramework: "solid",
  preflight: true,
  strictTokens: true,
  include: ["./src/ui/**/*.{ts,tsx}"],
  exclude: ["./src/ui/generated/**"],
  outdir: "src/ui/generated",
  outExtension: "js",
  conditions: { dark: "[data-theme=dark] &" },
  theme: {
    extend: {
      tokens: {
        colors: {
          ink: { value: "#151A1E" },
          slate: { value: "#37434B" },
          paper: { value: "#F4F0E6" },
          surface: { value: "#FAF8F2" },
          terrain: { value: "#365A72" },
          backdrop: { value: "rgba(21, 26, 30, 0.55)" },
        },
        fonts: {
          body: {
            value:
              '"Pretendard Variable", "Pretendard", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          },
          mono: {
            value: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Consolas, monospace',
          },
        },
        fontSizes: {
          xs: { value: "12px" },
          sm: { value: "13px" },
          md: { value: "14px" },
          lg: { value: "16px" },
          xl: { value: "18px" },
          "2xl": { value: "20px" },
          "3xl": { value: "24px" },
          "4xl": { value: "32px" },
          iconXs: { value: "14px" },
          iconSm: { value: "16px" },
          iconMd: { value: "18px" },
          iconLg: { value: "20px" },
          iconXl: { value: "24px" },
          iconDisplay: { value: "32px" },
        },
        fontWeights: {
          regular: { value: "400" },
          medium: { value: "500" },
          semibold: { value: "600" },
        },
        lineHeights: {
          xs: { value: "16px" },
          sm: { value: "18px" },
          md: { value: "20px" },
          lg: { value: "24px" },
          xl: { value: "26px" },
          "2xl": { value: "28px" },
          "3xl": { value: "32px" },
          "4xl": { value: "40px" },
        },
        letterSpacings: {
          display: { value: "-0.02em" },
          pageHeading: { value: "-0.015em" },
          heading: { value: "-0.01em" },
          normal: { value: "0" },
          label: { value: "0.04em" },
        },
        sizes: {
          iconXs: { value: "14px" },
          iconSm: { value: "16px" },
          iconMd: { value: "18px" },
          iconLg: { value: "20px" },
          iconXl: { value: "24px" },
          iconDisplay: { value: "32px" },
          dialog: { value: "calc(100% - 2rem)" },
          shellViewport: { value: "calc(100dvh - 3rem)" },
        },
        zIndex: {
          base: { value: "0" },
          modal: { value: "1100" },
          skipLink: { value: "1200" },
        },
        durations: {
          none: { value: "0ms" },
          instant: { value: "80ms" },
          fast: { value: "120ms" },
          normal: { value: "180ms" },
          deliberate: { value: "240ms" },
          slow: { value: "320ms" },
        },
        easings: {
          standard: { value: "cubic-bezier(0.2, 0, 0, 1)" },
          enter: { value: "cubic-bezier(0.16, 1, 0.3, 1)" },
          exit: { value: "cubic-bezier(0.4, 0, 1, 1)" },
          emphasized: { value: "cubic-bezier(0.16, 1, 0.3, 1)" },
        },
      },
      semanticTokens: {
        colors: {
          canvas: { value: { base: "{colors.paper}", _dark: "{colors.ink}" } },
          content: { value: { base: "{colors.surface}", _dark: "#252C32" } },
          text: { value: { base: "{colors.ink}", _dark: "{colors.paper}" } },
          muted: { value: { base: "{colors.slate}", _dark: "#BDC9D0" } },
          action: { value: { base: "{colors.terrain}", _dark: "#A7BBC4" } },
          onAction: {
            value: { base: "{colors.surface}", _dark: "{colors.ink}" },
          },
          boundary: { value: { base: "#738089", _dark: "#8A9AA5" } },
          danger: { value: { base: "#A52C22", _dark: "#FFAEA5" } },
          icon: {
            default: { value: { base: "{colors.ink}", _dark: "{colors.paper}" } },
            muted: { value: { base: "{colors.slate}", _dark: "#BDC9D0" } },
            subtle: { value: { base: "#738089", _dark: "#8A9AA5" } },
            success: { value: { base: "#296F51", _dark: "#8FD1AE" } },
            warning: { value: { base: "#8F5F00", _dark: "#F3C55E" } },
            danger: { value: { base: "#A52C22", _dark: "#FFAEA5" } },
            info: { value: { base: "#3862B6", _dark: "#9AB7FF" } },
            disabled: { value: { base: "#8B959B", _dark: "#6F7B83" } },
            inverse: { value: { base: "{colors.surface}", _dark: "{colors.ink}" } },
          },
        },
        durations: {
          feedback: { value: "{durations.instant}" },
          enter: { value: "{durations.normal}" },
          exit: { value: "{durations.instant}" },
          disclosure: { value: "{durations.normal}" },
          spatial: { value: "{durations.deliberate}" },
          emphasis: { value: "{durations.normal}" },
        },
        easings: {
          motionStandard: { value: "{easings.standard}" },
          motionEnter: { value: "{easings.enter}" },
          motionExit: { value: "{easings.exit}" },
          motionEmphasized: { value: "{easings.emphasized}" },
        },
      },
      keyframes: {
        "enter-subtle": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "exit-subtle": {
          from: { opacity: 1, transform: "translateY(0)" },
          to: { opacity: 0, transform: "translateY(2px)" },
        },
        "fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "fade-out": {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      },
      animationStyles: motionAnimationStyles,
      textStyles: {
        body: {
          value: {
            fontFamily: "body",
            fontSize: "md",
            fontWeight: "regular",
            lineHeight: "md",
            letterSpacing: "normal",
          },
        },
        bodyCompact: {
          value: {
            fontFamily: "body",
            fontSize: "sm",
            fontWeight: "regular",
            lineHeight: "sm",
            letterSpacing: "normal",
          },
        },
        label: {
          value: {
            fontFamily: "body",
            fontSize: "sm",
            fontWeight: "medium",
            lineHeight: "sm",
            letterSpacing: "normal",
          },
        },
        helper: {
          value: {
            fontFamily: "body",
            fontSize: "xs",
            fontWeight: "regular",
            lineHeight: "xs",
            letterSpacing: "normal",
          },
        },
        metadata: {
          value: {
            fontFamily: "body",
            fontSize: "xs",
            fontWeight: "regular",
            lineHeight: "xs",
            letterSpacing: "normal",
          },
        },
        tableHeader: {
          value: {
            fontFamily: "body",
            fontSize: "sm",
            fontWeight: "medium",
            lineHeight: "sm",
            letterSpacing: "normal",
          },
        },
        tableCell: {
          value: {
            fontFamily: "body",
            fontSize: "md",
            fontWeight: "regular",
            lineHeight: "md",
            letterSpacing: "normal",
          },
        },
        pageTitle: {
          value: {
            fontFamily: "body",
            fontSize: "3xl",
            fontWeight: "semibold",
            lineHeight: "3xl",
            letterSpacing: "pageHeading",
          },
        },
        sectionTitle: {
          value: {
            fontFamily: "body",
            fontSize: "xl",
            fontWeight: "semibold",
            lineHeight: "xl",
            letterSpacing: "heading",
          },
        },
        display: {
          value: {
            fontFamily: "body",
            fontSize: "4xl",
            fontWeight: "semibold",
            lineHeight: "4xl",
            letterSpacing: "display",
          },
        },
        button: {
          value: {
            fontFamily: "body",
            fontSize: "md",
            fontWeight: "medium",
            lineHeight: "md",
            letterSpacing: "normal",
          },
        },
        status: {
          value: {
            fontFamily: "body",
            fontSize: "sm",
            fontWeight: "medium",
            lineHeight: "sm",
            letterSpacing: "normal",
          },
        },
        numeric: {
          value: {
            fontFamily: "body",
            fontSize: "md",
            fontWeight: "medium",
            lineHeight: "md",
            letterSpacing: "normal",
            fontVariantNumeric: "tabular-nums",
          },
        },
        code: {
          value: {
            fontFamily: "mono",
            fontSize: "sm",
            fontWeight: "regular",
            lineHeight: "sm",
            letterSpacing: "normal",
          },
        },
      },
      recipes: {
        control: {
          className: "control",
          base: {
            textStyle: "body",
            borderRadius: "sm",
            borderWidth: "1px",
            borderColor: "boundary",
            minHeight: "11",
            px: "3",
            py: "2",
            color: "text",
            bg: "content",
            _focusVisible: {
              outline: "3px solid",
              outlineColor: "action",
              outlineOffset: "2px",
            },
            _disabled: { cursor: "not-allowed" },
            "@media (forced-colors: active)": {
              color: "ButtonText",
              background: "ButtonFace",
              borderColor: "ButtonText",
            },
          },
          variants: {
            kind: {
              action: {
                textStyle: "button",
                bg: "action",
                color: "onAction",
                cursor: "pointer",
                "@media (forced-colors: active)": {
                  color: "ButtonText",
                  background: "ButtonFace",
                  borderColor: "ButtonText",
                },
              },
              input: { width: "full", maxWidth: "xl" },
            },
          },
        },
        surface: {
          className: "surface",
          base: {
            bg: "content",
            borderWidth: "1px",
            borderColor: "boundary",
            p: "5",
            borderRadius: "sm",
          },
        },
      },
    },
  },
  staticCss: { recipes: { control: ["*"], surface: ["*"] } },
  globalCss: {
    "html": {
      bg: "canvas",
      color: "text",
      textStyle: "body",
    },
    "body": { margin: "0" },
    "h1": { textStyle: "pageTitle" },
    "h2": { textStyle: "sectionTitle" },
    "a": {
      color: "action",
      textDecoration: "underline",
      textUnderlineOffset: "3px",
    },
    "a:focus-visible, summary:focus-visible": {
      outline: "3px solid",
      outlineColor: "action",
      outlineOffset: "3px",
    },
    "button:disabled": { opacity: "0.6" },
    "table": {
      width: "full",
      borderCollapse: "collapse",
      fontVariantNumeric: "tabular-nums",
    },
    "th, td": {
      textAlign: "left",
      p: "3",
      borderBottomWidth: "1px",
      borderColor: "boundary",
      verticalAlign: "top",
      overflowWrap: "anywhere",
    },
    "th": { textStyle: "tableHeader" },
    "td": { textStyle: "tableCell" },
    "caption": { textAlign: "left", color: "muted", pb: "3" },
    "[role=alert]": { color: "danger" },
    "@media (forced-colors: active)": {
      "button, input": { border: "1px solid ButtonText" },
    },
  },
})
