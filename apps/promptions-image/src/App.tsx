import React from "react";
import {
    FluentProvider,
    webLightTheme,
    makeStyles,
    tokens,
    Menu,
    MenuTrigger,
    MenuPopover,
    MenuList,
    MenuItem,
    Button,
} from "@fluentui/react-components";
import { ChevronDown24Regular, Options24Regular } from "@fluentui/react-icons";
import { ImageService } from "./services/ImageService";
import { PromptionsImageService } from "./services/PromptionsImageService";
import { produce } from "immer";
import { useMounted } from "./reactUtil";
import { ImageInput, GeneratedImage, OptionsPanel } from "./components";
import { compactOptionSet, basicOptionSet, BasicOptions, Options, VisualOptionSet } from "@promptions/promptions-ui";

const useStyles = makeStyles({
    appContainer: {
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: tokens.colorNeutralBackground1,
        fontFamily: tokens.fontFamilyBase,
    },
    header: {
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
        backgroundColor: tokens.colorNeutralBackground2,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        boxShadow: tokens.shadow4,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerTitle: {
        fontSize: tokens.fontSizeBase600,
        fontWeight: tokens.fontWeightSemibold,
        color: tokens.colorNeutralForeground1,
        margin: 0,
    },
    headerActions: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalM,
    },
    mainContainer: {
        flex: 1,
        display: "flex",
        overflow: "hidden",
    },
    leftPanel: {
        width: "40%",
        padding: tokens.spacingHorizontalL,
        borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalL,
    },
    rightPanel: {
        width: "60%",
        padding: tokens.spacingHorizontalL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tokens.colorNeutralBackground2,
    },
});

// State type for reactive state management
type State<T> = { get: T; set: (fn: (prev: T) => void) => void };

interface ImageState {
    prompt: string;
    options: Options;
    optionsLoading: boolean;
    imageUrl?: string;
    imageLoading: boolean;
    error?: string;
    abortController?: AbortController;
}

const imageService = new ImageService();

function App() {
    const mount = useMounted();
    const abortControllerRef = React.useRef<AbortController | null>(null);
    const [visualOptionsSet, setVisualOptionsSet] = React.useState<VisualOptionSet<BasicOptions>>(basicOptionSet);

    const optionsSet = React.useMemo(() => {
        const { getComponent, ...options } = visualOptionsSet;
        return options;
    }, [visualOptionsSet]);

    const getComponent = React.useMemo(() => visualOptionsSet.getComponent(), [visualOptionsSet]);

    const promptionsImageService = React.useMemo(() => {
        return new PromptionsImageService(imageService, optionsSet);
    }, [optionsSet]);

    const [state, setState] = React.useState<ImageState>({
        prompt: "",
        options: optionsSet.emptyOptions(),
        optionsLoading: false,
        imageLoading: false,
    });

    const handleOptionSetChange = (newOptionSet: VisualOptionSet<BasicOptions>) => {
        setVisualOptionsSet(newOptionSet);
    };

    const styles = useStyles();

    const imageState: State<ImageState> = {
        get: state,
        set: React.useCallback(
            (f: any) => {
                if (!mount.isMounted) return;
                setState((prev) => {
                    const next = produce(prev, f);
                    return next;
                });
            },
            [mount],
        ),
    };

    const handlePromptChange = (newPrompt: string) => {
        imageState.set((draft) => {
            draft.prompt = newPrompt;
            draft.error = undefined;
        });
    };

    const handleElaborate = async () => {
        if (!state.prompt.trim()) return;

        // Abort any existing operation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        imageState.set((draft) => {
            draft.options = visualOptionsSet.emptyOptions();
            draft.optionsLoading = true;
            draft.error = undefined;
            draft.abortController = abortController;
        });

        try {
            await promptionsImageService.getPromptOptions(
                state.prompt,
                (options: BasicOptions, done: boolean) => {
                    imageState.set((draft) => {
                        draft.options = visualOptionsSet.mergeOptions(draft.options as BasicOptions, options);
                        draft.optionsLoading = !done;
                        if (done) {
                            draft.abortController = undefined;
                            abortControllerRef.current = null;
                        }
                    });
                },
                { signal: abortController.signal },
            );
        } catch (error) {
            imageState.set((draft) => {
                draft.optionsLoading = false;
                draft.abortController = undefined;
                if (error instanceof Error && error.name !== "AbortError") {
                    draft.error = error.message;
                }
            });
            abortControllerRef.current = null;
        }
    };

    const handleCancelElaborate = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            imageState.set((draft) => {
                draft.optionsLoading = false;
                draft.abortController = undefined;
            });
        }
    };

    const handleGenerate = async () => {
        if (!state.prompt.trim()) return;

        // Abort any existing operation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        imageState.set((draft) => {
            draft.imageLoading = true;
            draft.error = undefined;
            draft.abortController = abortController;
        });

        try {
            // Combine prompt with options to create enhanced prompt
            let enhancedPrompt = state.prompt;
            if (!state.options.isEmpty()) {
                if (state.options.prettyPrintAsConversation) {
                    const answer = state.options.prettyPrintAsConversation().answer;
                    enhancedPrompt = `${state.prompt}\n\nAdditional details:\n\n${answer}`;
                } else {
                    enhancedPrompt = `${state.prompt}\n\nAdditional details: ${state.options.prettyPrint()}`;
                }
            }

            const images = await imageService.generateImage(
                {
                    kind: "gpt-image-1",
                    prompt: enhancedPrompt,
                    size: "1024x1024",
                    quality: "high",
                    n: 1,
                },
                {
                    signal: abortController.signal,
                },
            );

            imageState.set((draft) => {
                draft.imageUrl = images[0] ? `data:image/png;base64,${images[0].base64String}` : undefined;
                draft.imageLoading = false;
                draft.abortController = undefined;
            });
            abortControllerRef.current = null;
        } catch (error) {
            imageState.set((draft) => {
                draft.imageLoading = false;
                draft.abortController = undefined;
                if (error instanceof Error && error.name !== "AbortError") {
                    draft.error = error.message;
                }
            });
            abortControllerRef.current = null;
        }
    };

    const handleCancelGenerate = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            imageState.set((draft) => {
                draft.imageLoading = false;
                draft.abortController = undefined;
            });
        }
    };

    const handleOptionsChange = (newOptions: Options) => {
        imageState.set((draft) => {
            draft.options = newOptions as BasicOptions;
        });
    };

    React.useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return (
        <FluentProvider theme={webLightTheme}>
            <div className={styles.appContainer}>
                <header className={styles.header}>
                    <h1 className={styles.headerTitle}>Promptions AI Image Generator</h1>
                    <div className={styles.headerActions}>
                        <Menu>
                            <MenuTrigger disableButtonEnhancement>
                                <Button appearance="subtle" icon={<Options24Regular />} iconPosition="before">
                                    {visualOptionsSet === basicOptionSet ? "Expanded Options" : "Compact Options"}
                                    <ChevronDown24Regular style={{ marginLeft: "8px" }} />
                                </Button>
                            </MenuTrigger>
                            <MenuPopover>
                                <MenuList>
                                    <MenuItem
                                        onClick={() => handleOptionSetChange(basicOptionSet)}
                                        disabled={visualOptionsSet === basicOptionSet}
                                    >
                                        Expanded Options
                                    </MenuItem>
                                    <MenuItem
                                        onClick={() => handleOptionSetChange(compactOptionSet)}
                                        disabled={visualOptionsSet === compactOptionSet}
                                    >
                                        Compact Options
                                    </MenuItem>
                                </MenuList>
                            </MenuPopover>
                        </Menu>
                    </div>
                </header>

                <div className={styles.mainContainer}>
                    <div className={styles.leftPanel}>
                        <ImageInput
                            prompt={state.prompt}
                            onPromptChange={handlePromptChange}
                            onElaborate={handleElaborate}
                            onGenerate={handleGenerate}
                            onCancelElaborate={handleCancelElaborate}
                            onCancelGenerate={handleCancelGenerate}
                            elaborateLoading={state.optionsLoading}
                            generateLoading={state.imageLoading}
                            error={state.error}
                        />

                        <OptionsPanel
                            options={state.options}
                            optionsRenderer={getComponent}
                            onOptionsChange={handleOptionsChange}
                            loading={state.optionsLoading}
                        />
                    </div>

                    <div className={styles.rightPanel}>
                        <GeneratedImage imageUrl={state.imageUrl} loading={state.imageLoading} prompt={state.prompt} />
                    </div>
                </div>
            </div>
        </FluentProvider>
    );
}

export default App;
