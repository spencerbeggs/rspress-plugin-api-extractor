import type { PathLike } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import type { ApiModel, ApiPackage } from "@microsoft/api-extractor-model";
import { ApiModel as ApiModelClass } from "@microsoft/api-extractor-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedModel, PackageJson } from "./internal-types.js";
import { ApiModelLoader } from "./model-loader.js";
import type { SourceConfig, VersionConfig } from "./schemas/index.js";

/**
 * Tests for ApiModelLoader static class
 */

// Mock modules
vi.mock("node:fs");
vi.mock("node:path");

describe("ApiModelLoader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("loadPackageJson", () => {
		it("should load package.json from file path", async () => {
			const mockPath = "/path/to/package.json";
			const mockPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));

			const result = await ApiModelLoader.loadPackageJson(mockPath);

			expect(result).toEqual(mockPackageJson);
			expect(path.resolve).toHaveBeenCalledWith(mockPath);
			expect(fs.existsSync).toHaveBeenCalledWith(mockPath);
			expect(fs.readFileSync).toHaveBeenCalledWith(mockPath, "utf-8");
		});

		it("should load package.json from async function", async () => {
			const mockPackageJson: PackageJson = {
				name: "test-package",
				version: "2.0.0",
				dependencies: { foo: "^1.0.0" },
			};

			const loader = async (): Promise<PackageJson> => mockPackageJson;
			const result = await ApiModelLoader.loadPackageJson(loader);

			expect(result).toEqual(mockPackageJson);
			expect(path.resolve).not.toHaveBeenCalled();
			expect(fs.existsSync).not.toHaveBeenCalled();
		});

		it("should throw error if package.json file not found", async () => {
			const mockPath = "/path/to/missing.json";

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(false);

			await expect(ApiModelLoader.loadPackageJson(mockPath)).rejects.toThrow(
				`Package.json file not found: ${mockPath}`,
			);
		});

		it("should throw error if package.json has invalid JSON", async () => {
			const mockPath = "/path/to/invalid.json";
			const invalidJson = "{ invalid json }";

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(invalidJson);

			await expect(ApiModelLoader.loadPackageJson(mockPath)).rejects.toThrow(/Failed to parse package\.json at/);
		});

		it("should handle PathLike types (URL, Buffer)", async () => {
			const mockPath = new URL("file:///path/to/package.json");
			const mockPackageJson: PackageJson = { name: "url-package" };

			vi.mocked(path.resolve).mockReturnValue("/path/to/package.json");
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));

			const result = await ApiModelLoader.loadPackageJson(mockPath as PathLike);

			expect(result).toEqual(mockPackageJson);
			expect(path.resolve).toHaveBeenCalledWith("file:///path/to/package.json");
		});
	});

	describe("loadApiModel", () => {
		it("should load API model from file path", async () => {
			const mockPath = "/path/to/model.api.json";
			const mockPackage = { name: "test-package" } as ApiPackage;

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(true);

			vi.spyOn(ApiModelClass.prototype, "loadPackage").mockResolvedValue(mockPackage);

			const result = await ApiModelLoader.loadApiModel(mockPath);

			expect(result).toEqual({ apiPackage: mockPackage });
			expect(path.resolve).toHaveBeenCalledWith(mockPath);
			expect(fs.existsSync).toHaveBeenCalledWith(mockPath);
		});

		it("should throw error if API model file not found", async () => {
			const mockPath = "/path/to/missing.api.json";

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(false);

			await expect(ApiModelLoader.loadApiModel(mockPath)).rejects.toThrow(`API model file not found: ${mockPath}`);
		});

		it("should load API model from async function returning ApiModel", async () => {
			const mockPackage = { name: "test-package" } as ApiPackage;
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;

			const loader = async (): Promise<ApiModel> => mockApiModel;
			const result = await ApiModelLoader.loadApiModel(loader);

			expect(result).toEqual({ apiPackage: mockPackage });
		});

		it("should load API model from async function returning LoadedModel with source", async () => {
			const mockPackage = { name: "test-package" } as ApiPackage;
			const mockSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/main",
			};
			const mockLoadedModel: LoadedModel = {
				model: {
					packages: [mockPackage],
				} as unknown as ApiModel,
				source: mockSource,
			};

			const loader = async (): Promise<LoadedModel> => mockLoadedModel;
			const result = await ApiModelLoader.loadApiModel(loader);

			expect(result).toEqual({
				apiPackage: mockPackage,
				source: mockSource,
			});
		});

		it("should throw error if async function returns ApiModel with empty packages", async () => {
			const mockApiModel = {
				packages: [],
			} as unknown as ApiModel;

			const loader = async (): Promise<ApiModel> => mockApiModel;

			await expect(ApiModelLoader.loadApiModel(loader)).rejects.toThrow(
				"API model returned by function contains no packages",
			);
		});

		it("should throw error if async function returns LoadedModel with empty packages", async () => {
			const mockLoadedModel: LoadedModel = {
				model: {
					packages: [],
				} as unknown as ApiModel,
			};

			const loader = async (): Promise<LoadedModel> => mockLoadedModel;

			await expect(ApiModelLoader.loadApiModel(loader)).rejects.toThrow(
				"API model returned by function contains no packages",
			);
		});

		it("should throw error if async function returns invalid object (no packages)", async () => {
			const loader = async (): Promise<ApiModel> =>
				({
					notAModel: true,
				}) as unknown as ApiModel;

			await expect(ApiModelLoader.loadApiModel(loader)).rejects.toThrow(
				"API model loader function must return an ApiModel or LoadedModel",
			);
		});

		it("should throw error if async function returns null", async () => {
			const loader = async (): Promise<ApiModel> => null as unknown as ApiModel;

			await expect(ApiModelLoader.loadApiModel(loader)).rejects.toThrow(
				"API model loader function must return an ApiModel or LoadedModel",
			);
		});

		it("should throw error if LoadedModel has invalid model property", async () => {
			const mockLoadedModel: LoadedModel = {
				model: {
					notPackages: [],
				} as unknown as ApiModel,
			};

			const loader = async (): Promise<LoadedModel> => mockLoadedModel;

			await expect(ApiModelLoader.loadApiModel(loader)).rejects.toThrow(
				"API model loader function must return an ApiModel",
			);
		});
	});

	describe("loadVersionModel", () => {
		it("should load version model from PathLike", async () => {
			const mockPath = "/path/to/version.api.json";
			const mockPackage = { name: "version-package" } as ApiPackage;

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.spyOn(ApiModelClass.prototype, "loadPackage").mockResolvedValue(mockPackage);

			const result = await ApiModelLoader.loadVersionModel(mockPath);

			expect(result).toEqual({ apiPackage: mockPackage });
		});

		it("should load version model from async function", async () => {
			const mockPackage = { name: "async-package" } as ApiPackage;
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;

			const loader = async (): Promise<ApiModel> => mockApiModel;
			const result = await ApiModelLoader.loadVersionModel(loader);

			expect(result).toEqual({ apiPackage: mockPackage });
		});

		it("should load version model from async function with source", async () => {
			const mockPackage = { name: "source-package" } as ApiPackage;
			const mockSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/v1.0.0",
			};
			const mockLoadedModel: LoadedModel = {
				model: {
					packages: [mockPackage],
				} as unknown as ApiModel,
				source: mockSource,
			};

			const loader = async (): Promise<LoadedModel> => mockLoadedModel;
			const result = await ApiModelLoader.loadVersionModel(loader);

			expect(result).toEqual({
				apiPackage: mockPackage,
				source: mockSource,
			});
		});

		it("should load version model from VersionConfig with all properties", async () => {
			const mockPackage = { name: "config-package" } as ApiPackage;
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;
			const mockPackageJson: PackageJson = {
				name: "config-package",
				version: "1.0.0",
			};
			const mockSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/main",
			};

			const versionConfig: VersionConfig = {
				model: async (): Promise<ApiModel> => mockApiModel,
				packageJson: async (): Promise<PackageJson> => mockPackageJson,
				categories: {
					custom: {
						displayName: "Custom",
						singularName: "Custom",
						folderName: "custom",
						collapsible: true,
						collapsed: true,
						overviewHeaders: [2],
					},
				},
				source: mockSource,
				externalPackages: [{ name: "zod", version: "3.22.4" }],
				ogImage: "/images/og.png",
				llmsPlugin: {
					enabled: true,
					scopes: true,
					apiTxt: true,
					showCopyButton: true,
					showViewOptions: true,
					copyButtonText: "Copy",
					viewOptions: ["chatgpt", "claude", "markdownLink"] as Array<"chatgpt" | "claude" | "markdownLink">,
				},
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			expect(result).toEqual({
				apiPackage: mockPackage,
				packageJson: mockPackageJson,
				categories: versionConfig.categories,
				source: mockSource,
				externalPackages: versionConfig.externalPackages,
				ogImage: versionConfig.ogImage,
				llmsPlugin: versionConfig.llmsPlugin,
			});
		});

		it("should load version model from VersionConfig with minimal properties", async () => {
			const mockPackage = { name: "minimal-package" } as ApiPackage;
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;

			const versionConfig: VersionConfig = {
				model: async (): Promise<ApiModel> => mockApiModel,
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			expect(result).toEqual({
				apiPackage: mockPackage,
				packageJson: undefined,
				categories: undefined,
				source: undefined,
				externalPackages: undefined,
				ogImage: undefined,
				llmsPlugin: undefined,
			});
		});

		it("should prioritize loader source over config source", async () => {
			const mockPackage = { name: "priority-package" } as ApiPackage;
			const loaderSource: SourceConfig = {
				url: "https://github.com/loader/repo",
				ref: "blob/loader",
			};
			const configSource: SourceConfig = {
				url: "https://github.com/config/repo",
				ref: "blob/config",
			};
			const mockLoadedModel: LoadedModel = {
				model: {
					packages: [mockPackage],
				} as unknown as ApiModel,
				source: loaderSource,
			};

			const versionConfig: VersionConfig = {
				model: async (): Promise<LoadedModel> => mockLoadedModel,
				source: configSource,
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			// Loader source should take precedence
			expect(result.source).toEqual(loaderSource);
		});

		it("should use config source if loader does not provide source", async () => {
			const mockPackage = { name: "config-only-package" } as ApiPackage;
			const configSource: SourceConfig = {
				url: "https://github.com/config/repo",
				ref: "blob/main",
			};
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;

			const versionConfig: VersionConfig = {
				model: async (): Promise<ApiModel> => mockApiModel,
				source: configSource,
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			expect(result.source).toEqual(configSource);
		});

		it("should load package.json from PathLike in VersionConfig", async () => {
			const mockPackage = { name: "pkg-path-package" } as ApiPackage;
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;
			const mockPackageJson: PackageJson = {
				name: "pkg-path-package",
				version: "1.0.0",
			};
			const pkgPath = "/path/to/package.json";

			vi.mocked(path.resolve).mockReturnValue(pkgPath);
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));

			const versionConfig: VersionConfig = {
				model: async (): Promise<ApiModel> => mockApiModel,
				packageJson: pkgPath,
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			expect(result.packageJson).toEqual(mockPackageJson);
		});

		it("should load package.json from async function in VersionConfig", async () => {
			const mockPackage = { name: "pkg-func-package" } as ApiPackage;
			const mockApiModel = {
				packages: [mockPackage],
			} as unknown as ApiModel;
			const mockPackageJson: PackageJson = {
				name: "pkg-func-package",
				version: "2.0.0",
				dependencies: { bar: "^2.0.0" },
			};

			const versionConfig: VersionConfig = {
				model: async (): Promise<ApiModel> => mockApiModel,
				packageJson: async (): Promise<PackageJson> => mockPackageJson,
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			expect(result.packageJson).toEqual(mockPackageJson);
		});

		it("should handle VersionConfig with model as PathLike", async () => {
			const mockPath = "/path/to/config.api.json";
			const mockPackage = { name: "config-path-package" } as ApiPackage;

			vi.mocked(path.resolve).mockReturnValue(mockPath);
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.spyOn(ApiModelClass.prototype, "loadPackage").mockResolvedValue(mockPackage);

			const versionConfig: VersionConfig = {
				model: mockPath,
			};

			const result = await ApiModelLoader.loadVersionModel(versionConfig);

			expect(result.apiPackage).toEqual(mockPackage);
		});
	});
});
